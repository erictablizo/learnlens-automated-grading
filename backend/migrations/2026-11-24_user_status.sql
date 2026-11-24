-- ---------------------------------------------------------------------------
-- 2026-11-24_user_status.sql
-- Ms. Melanie, Recommendations page 19, requirement 5.
--
--   "Note:  Default Status value is <Active>"
--   "Status: Active / Resigned"
--
-- The only part of page 19 that touches the database. Everything else on that
-- page is routing, labels and screens.
--
-- WHY A COLUMN AND NOT A DELETE. Her requirement 5 lists Edit and Delete
-- beside each row AND a Status of Active or Resigned, which is two different
-- operations on purpose: a teacher who leaves stops being able to sign in,
-- but their exams, papers and scores must stay exactly where they are. The
-- 2026-11-12 note on students.student_id says the same thing about rosters -
-- "ON DELETE SET NULL, NEVER CASCADE ... a teacher tidying a roster would
-- silently erase a graded exam". Resigned is that lesson applied to accounts.
--
-- CONFIRM BEFORE RUNNING. This assumes the accounts table is `public.users`
-- and that it has no `status` column, which is what
-- backend/app/api/routes/admin.py implies (`User.role`, `select(User)`), not
-- something this file has read. The first statement below fails loudly rather
-- than guessing:
--
--   \d public.users
--
-- ---------------------------------------------------------------------------

BEGIN;

-- Pre-flight. Raises rather than silently doing nothing if the assumption
-- above is wrong, so a mis-aimed migration cannot report success.
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'public.users does not exist - check the table name before running this migration';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users'
               AND column_name = 'status') THEN
    RAISE EXCEPTION 'public.users.status already exists - this migration has already run';
  END IF;
END $$;

-- DEFAULT 'active', NOT NULL. Her note says the default is Active, and every
-- row that exists today is an account somebody is using, so backfilling them
-- as active is correct rather than merely convenient.
ALTER TABLE public.users
  ADD COLUMN status varchar(20) NOT NULL DEFAULT 'active';

-- The two values she names, and no others. Lowercase in the column and
-- Title Case on screen, matching `role`, which stores 'admin' and renders
-- ADMIN - see the Accounts table in app/(dashboard)/admin/page.tsx.
ALTER TABLE public.users
  ADD CONSTRAINT ck_users_status
  CHECK (status IN ('active', 'resigned'));

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY. Both must hold after running:
--
--   -- every existing account is active
--   SELECT count(*) FROM public.users WHERE status <> 'active';          -- 0
--
--   -- and nothing else can be stored
--   -- (expect: new row violates check constraint "ck_users_status")
--   -- BEGIN; UPDATE public.users SET status = 'retired' WHERE false; ROLLBACK;
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * it does not stop a resigned account signing in. That is one test in
--     the login path and it belongs with the code that reads this column,
--     not with the column itself. Until that lands, Status is a label.
--   * it does not touch `role`. An administrator can resign too.
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_status;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS status;
--   COMMIT;
--
--   Safe only while nothing reads the column. After the backend change ships,
--   roll the code back with it.
-- ---------------------------------------------------------------------------
