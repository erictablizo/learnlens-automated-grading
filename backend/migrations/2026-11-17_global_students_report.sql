-- ===========================================================================
-- LearnLens — what 2026-11-17_global_students.sql WOULD do.   READ ONLY.
--
--   psql -U <user> -d <db> -f 2026-11-17_global_students_report.sql
--
-- Writes nothing. Run it, read it, and only then run the migration.
-- ===========================================================================

\echo
\echo '=== 1. Student numbers held by more than one teacher ====================='
\echo '    These rows MERGE. The keeper is the row an ADMIN entered, else'
\echo '    the lowest student_id.'
\echo
WITH ranked AS (
    SELECT s.student_id, s.created_by, u.role, s.student_number,
           s.last_name, s.first_name, s.middle_name, s.section,
           row_number() OVER w AS rn,
           first_value(s.student_id) OVER w AS keeper_id,
           count(*)    OVER (PARTITION BY lower(trim(s.student_number))) AS in_group
    FROM students s
    JOIN users u ON u.user_id = s.created_by
    WINDOW w AS (PARTITION BY lower(trim(s.student_number))
                 ORDER BY (u.role = 'admin') DESC, s.student_id)
)
SELECT student_number,
       student_id,
       created_by || ' (' || role || ')' AS entered_by,
       last_name || ', ' || first_name || ' ' || coalesce(middle_name,'') AS name,
       coalesce(section,'—') AS section,
       CASE WHEN rn = 1 THEN 'KEEP' ELSE 'DELETE -> ' || keeper_id END AS verdict
FROM ranked
WHERE in_group > 1
ORDER BY lower(trim(student_number)), rn;

\echo
\echo '=== 2. Do the merging rows actually look like the same person? ==========='
\echo '    Any "DIFFERENT" below is a data error to fix BEFORE migrating.'
\echo
WITH g AS (
    SELECT lower(trim(student_number)) AS num,
           count(DISTINCT lower(trim(last_name  || '|' || first_name))) AS names
    FROM students GROUP BY 1 HAVING count(*) > 1
)
SELECT num AS student_number,
       CASE WHEN names = 1 THEN 'same person'
            ELSE 'DIFFERENT PEOPLE — STOP' END AS verdict
FROM g ORDER BY num;

\echo
\echo '=== 3. Papers that would be repointed ===================================='
\echo
WITH ranked AS (
    SELECT s.student_id,
           row_number() OVER w AS rn,
           first_value(s.student_id) OVER w AS keeper_id
    FROM students s JOIN users u ON u.user_id = s.created_by
    WINDOW w AS (PARTITION BY lower(trim(s.student_number))
                 ORDER BY (u.role = 'admin') DESC, s.student_id)
)
SELECT p.paper_id, p.exam_id, p.student_id AS from_student, r.keeper_id AS to_student
FROM test_papers p JOIN ranked r ON r.student_id = p.student_id AND r.rn > 1
ORDER BY p.paper_id;

\echo
\echo '=== 4. Would the migration REFUSE? ======================================='
\echo '    Non-zero means one student has papers under both numbers in one exam.'
\echo
WITH ranked AS (
    SELECT s.student_id,
           row_number() OVER w AS rn,
           first_value(s.student_id) OVER w AS keeper_id
    FROM students s JOIN users u ON u.user_id = s.created_by
    WINDOW w AS (PARTITION BY lower(trim(s.student_number))
                 ORDER BY (u.role = 'admin') DESC, s.student_id)
)
SELECT count(*) AS colliding_papers,
       CASE WHEN count(*) = 0 THEN 'safe to run' ELSE 'WILL REFUSE' END AS verdict
FROM test_papers p
JOIN ranked r ON p.student_id = r.student_id AND r.rn > 1
JOIN test_papers q ON q.exam_id = p.exam_id AND q.student_id = r.keeper_id;

\echo
\echo '=== 5. Totals before ====================================================='
\echo
SELECT (SELECT count(*) FROM students)                                   AS students,
       (SELECT count(*) FROM students s JOIN users u ON u.user_id = s.created_by
         WHERE u.role = 'admin')                                         AS entered_by_admin,
       (SELECT count(*) FROM test_papers WHERE student_id IS NOT NULL)   AS linked_papers,
       (SELECT count(*) FROM pg_indexes WHERE indexname = 'ux_students_owner_number')
                                                                         AS per_teacher_index,
       (SELECT count(*) FROM pg_tables  WHERE tablename = 'class_lists') AS class_lists_exists;
\echo
