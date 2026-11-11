-- 2026-11-11 — one address is one account, however it is typed.
--
-- MEASURED 2026-11-11 against the real lookups: register_user() checked for
-- duplicates with `User.email == email`, which is case-sensitive, so
-- 'Grace@Gmail.com' inserted alongside an existing 'grace@gmail.com'. Once
-- both rows exist, _user_by_email() matches BOTH and scalar_one_or_none()
-- raises MultipleResultsFound — Forgot Password answers 500 instead of 404.
--
-- The application fix (services/auth_service.py) stops new pairs being
-- created. This index makes them impossible, which is what lets that file
-- keep scalar_one_or_none() for an identity lookup.
--
-- RUN THIS BEFORE DEPLOYING THE PYTHON. If it fails with a uniqueness error,
-- the pair already exists and must be merged by hand first:
--
--     SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
--
-- Guarded, so re-running is harmless.

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_lower_email ON users (lower(email));