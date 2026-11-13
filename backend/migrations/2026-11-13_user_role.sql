-- 2026-11-13_user_role.sql
-- Adds the administrator role. Idempotent; safe to run twice.
BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS role character varying(16) NOT NULL DEFAULT 'teacher';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'admin'));
    END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- MAKING THE FIRST ADMINISTRATOR
--
-- Deliberately by hand, and deliberately not part of the migration above.
-- There is no API that sets this column, because an endpoint that can grant
-- admin is an endpoint that can be tricked into granting admin. Registration
-- never reads a role field; every account starts as 'teacher'.
--
-- Run this once, with the real address:
--
--     UPDATE public.users SET role = 'admin' WHERE email = 'you@example.com';
--
-- and check it took:
--
--     SELECT email, role FROM public.users WHERE role = 'admin';
--
-- To remove an administrator, set the role back to 'teacher'. It takes effect
-- on their very next request - the role is read from this table every time,
-- not carried in their token.
-- ---------------------------------------------------------------------------
