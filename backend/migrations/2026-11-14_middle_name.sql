-- 2026-11-14_middle_name.sql
-- ===========================================================================
-- A middle name on the roster and on the test paper.
--
--     Alex Passion / Julius Bancud, Recommendations page 1, the class list:
--       "Student Number, / Student Last Name, / Student First Name,
--        / Student Middle Name"
--
-- Idempotent; safe to run twice. ADDITIVE AND NULLABLE, so it can be run
-- BEFORE the application code that uses it - every existing row simply has
-- NULL, and nothing reads the column until the new code ships.
--
-- WHY THE COLUMN IS A NAME AND THE SCREENS SAY "INITIAL"
-- ------------------------------------------------------
-- The recommendation says Middle NAME; the screens are being built to ask for
-- a middle INITIAL, which is what a teacher writes on a paper. Storing the
-- wider of the two costs nothing today and means the UI can be widened later
-- with a label change instead of a second migration - whereas a varchar(2)
-- would have to be migrated the first time somebody types "Reyes".
--
-- 100 to match students.last_name / first_name, which are varchar(255), and
-- user_profiles.first_name, which is varchar(100). 100 is the smaller of the
-- two conventions already in this schema and is far more than a middle name
-- needs; the point is that it is a limit the API can report as a sentence
-- rather than a value PostgreSQL refuses.
-- ===========================================================================
BEGIN;

-- ── the roster ─────────────────────────────────────────────────────────────
-- NULLABLE, and no default. A roster filled in before today has no middle
-- names, and inventing an empty string for those rows would make "not stated"
-- indistinguishable from "deliberately blank" - the same distinction
-- user_profiles.year_level keeps by staying NULL.
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS middle_name character varying(100);

-- ── the paper ──────────────────────────────────────────────────────────────
-- test_papers keeps its OWN copy of the name, exactly as last_name and
-- first_name were added on 2026-11-04 and deliberately not backfilled. That is
-- what lets a paper stay readable after the roster entry behind it is deleted
-- (students are ON DELETE SET NULL, 2026-11-12), and what lets a paper be
-- added by name alone with no roster entry at all.
ALTER TABLE public.test_papers
    ADD COLUMN IF NOT EXISTS middle_name character varying(100);

COMMIT;

-- ---------------------------------------------------------------------------
-- NOT DONE HERE, ON PURPOSE:
--
--   * students.student_name / test_papers.student_name are NOT recomposed.
--     Every existing row's composed name is still correct - it just has no
--     middle name in it, which is true. Rewriting them would touch rows the
--     teacher has not asked to change.
--
--   * ux_students_owner_number is NOT altered. A student is identified by
--     their number, not by their name, so the middle name has no part in
--     uniqueness.
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE public.test_papers DROP COLUMN IF EXISTS middle_name;
--   ALTER TABLE public.students    DROP COLUMN IF EXISTS middle_name;
--   COMMIT;
-- ---------------------------------------------------------------------------
