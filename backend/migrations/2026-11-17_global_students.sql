-- ===========================================================================
-- LearnLens — students become GLOBAL, and teachers get class lists.
-- 2026-11-17.  Recommendations page 6.
--
--   "Once you input the Student number, it will auto-populate the Student Name
--    Info (Last Name, First Name and Middle Name) and Section Name from GLOBAL
--    Database input of ADMIN ID."
--   "For ADMIN Page ONLY: ... Where we maintain and add Student Number, Last
--    Name First Name, Middle Name and Section. This the GLOBAL info of Student
--    Info."
--
-- WHAT CHANGES, and the second one is the dangerous one:
--
--   1. ux_students_owner_number  ->  ux_students_number
--      The roster stops being per-teacher. models.py said, on 2026-11-12:
--      "UNIQUE PER TEACHER, not globally: two teachers at one school may hold
--      the same student, and a global unique makes the second roster
--      impossible to fill." That reasoning was right for a per-teacher roster
--      and is exactly what page 6 overturns.
--
--   2. students_created_by_fkey  CASCADE -> SET NULL, created_by NULLABLE
--      THIS IS NOT COSMETIC. Today, deleting a teacher deletes their students.
--      Once the roster is global that would delete students every other
--      teacher depends on, and test_papers.student_id would go SET NULL across
--      the system - silently unlinking graded papers from the people who sat
--      them. created_by stops meaning "owner" and starts meaning "who typed
--      it in", so it may be null and must not cascade.
--      REMEMBER: models.py's User.students still carries
--      cascade="all, delete". The ORM would re-create this hazard on any
--      delete that goes through SQLAlchemy. That line must be removed in the
--      same change.
--
--   3. NEW class_lists / class_list_students
--      A teacher's list is (subject, schedule), not a section. Section stays
--      on the student, because page 6 has it auto-populate from the global
--      record.
--
-- RUN THE REPORT FIRST:  2026-11-17_global_students_report.sql
-- It names every row this would merge or delete. This file does the same work
-- but writes; if anything about the report surprises you, stop.
--
-- ONE TRANSACTION. Any failure rolls back the whole thing.
-- IDEMPOTENT: running it twice is a no-op.
-- ===========================================================================

BEGIN;

-- ── 0. The merge map: which duplicate rows lose, and to whom ───────────────
--
-- A row created by an ADMIN wins, because page 6 makes the admin's table the
-- global one. Failing that, the lowest student_id wins - deterministic, and
-- the oldest row is the one papers are most likely to point at already.
CREATE TEMP TABLE _merge ON COMMIT DROP AS
WITH ranked AS (
    SELECT s.student_id,
           lower(trim(s.student_number)) AS num,
           row_number() OVER w  AS rn,
           first_value(s.student_id) OVER w AS keeper_id
    FROM students s
    JOIN users u ON u.user_id = s.created_by
    WINDOW w AS (
        PARTITION BY lower(trim(s.student_number))
        ORDER BY (u.role = 'admin') DESC, s.student_id
    )
)
SELECT student_id AS loser_id, keeper_id, num
FROM ranked
WHERE rn > 1;

-- ── 1. REFUSE if merging would put two papers of one exam on one student ──
--
-- ux_test_papers_exam_student is UNIQUE (exam_id, student_id) WHERE
-- student_id IS NOT NULL. If a loser and its keeper both have a paper in the
-- same exam, repointing would violate it. That is not a case a migration may
-- guess at: it means the same student sat one exam twice under two numbers,
-- and a human has to say which paper is real.
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
    FROM test_papers p
    JOIN _merge m ON p.student_id = m.loser_id
    JOIN test_papers q ON q.exam_id = p.exam_id
                      AND q.student_id = m.keeper_id;
    IF n > 0 THEN
        RAISE EXCEPTION
          'REFUSED: % paper(s) would collide on ux_test_papers_exam_student. '
          'The same student has papers under BOTH numbers in one exam. '
          'Decide which paper is real, delete the other, then re-run.', n;
    END IF;
END $$;

-- ── 2. Repoint papers, then drop the losing rows ──────────────────────────
UPDATE test_papers p
   SET student_id = m.keeper_id
  FROM _merge m
 WHERE p.student_id = m.loser_id;

DELETE FROM students s
 USING _merge m
 WHERE s.student_id = m.loser_id;

-- ── 3. The index swap ─────────────────────────────────────────────────────
DROP INDEX IF EXISTS ux_students_owner_number;
CREATE UNIQUE INDEX IF NOT EXISTS ux_students_number
    ON students (lower(trim(student_number)));

-- created_by is no longer how the roster is read, so an index leading on it
-- earns nothing. Section is still filtered on.
DROP INDEX IF EXISTS ix_students_owner_section;
CREATE INDEX IF NOT EXISTS ix_students_section ON students (section);

-- ── 4. created_by stops owning, and stops cascading ───────────────────────
ALTER TABLE students ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_created_by_fkey;
ALTER TABLE students ADD CONSTRAINT students_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── 5. Class lists: (teacher, subject, schedule) ──────────────────────────
CREATE TABLE IF NOT EXISTS class_lists (
    class_list_id serial PRIMARY KEY,
    created_by    int NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    subject       varchar(255) NOT NULL,
    schedule      varchar(255) NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz DEFAULT now(),
    CONSTRAINT class_lists_subject_not_blank  CHECK (trim(subject)  <> ''),
    CONSTRAINT class_lists_schedule_not_blank CHECK (trim(schedule) <> '')
);

-- One list per teacher per subject+schedule, case- and space-insensitively,
-- for the reason ux_students_number is written the same way: "English101" and
-- "english101  " are one class, and finding that out from a split roster at
-- grading time is finding out too late.
CREATE UNIQUE INDEX IF NOT EXISTS ux_class_lists_owner_subject_schedule
    ON class_lists (created_by, lower(trim(subject)), lower(trim(schedule)));

CREATE TABLE IF NOT EXISTS class_list_students (
    class_list_id int NOT NULL REFERENCES class_lists(class_list_id) ON DELETE CASCADE,
    student_id    int NOT NULL REFERENCES students(student_id)       ON DELETE CASCADE,
    added_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (class_list_id, student_id)
);

-- The membership is read both ways: "who is in this list" (the PK covers it)
-- and "which lists is this student in", which a delete has to ask.
CREATE INDEX IF NOT EXISTS ix_class_list_students_student
    ON class_list_students (student_id);

COMMIT;
