-- 2026-11-14_reference_lists.sql
-- ===========================================================================
-- The three dropdown lists become data.
--
--     Alex Passion / Julius Bancud, Recommendations page 1:
--       "Create an Admin Page - only Admin ID can access this Page"
--       "Where to maintain the list of College Info in College Dropdown List"
--       "Where to maintain the list of Course / Program Info in ..."
--       "Where to maintain the list of Year Level Info in ..."
--
-- Idempotent; safe to run twice.
--
-- WHY THIS MIGRATION HAS TO DROP A CONSTRAINT, AND WHY THAT IS THE WHOLE POINT
-- ---------------------------------------------------------------------------
-- `user_profiles` carries this, written when the four colleges were fixed:
--
--     CONSTRAINT user_profiles_college_check CHECK ((college)::text = ANY
--         ((ARRAY['CVMAS','CBMA','CoEd','CAST'])::text[]))
--
-- MEASURED on PostgreSQL 16.15 before writing a line of this file:
--
--     UPDATE user_profiles SET college='CCJE' WHERE user_id=1;
--     ERROR:  new row for relation "user_profiles" violates check constraint
--             "user_profiles_college_check"
--
-- So an administrator could add a college to the new table, the dropdown would
-- offer it, the teacher would pick it, press Save - and the database would
-- refuse the row. The feature would be WORSE than inert: a 500 at the last
-- step, on a screen that had already told the teacher the college existed.
-- That is the 2026-11-04 shape (every layer of a change set in place except
-- one line, so the whole thing was dead) caught before shipping rather than
-- after.
--
-- The check is not replaced with a wider one. A CHECK cannot reference another
-- table, and a FOREIGN KEY would mean rewriting `user_profiles.college` from a
-- code to an id - a data migration across a column three screens read. The
-- rule moves UP into the application, where `reference_service.college_codes()`
-- validates it on every save. Stated plainly: after this migration the DATABASE
-- will accept any 20-character string in that column. The API will not.
--
-- `user_profiles_year_level_check` (1..6) is KEPT. Year levels are per college
-- now, but every one of them is still a number from 1 to 6, so that constraint
-- stays true and stays useful.
-- ===========================================================================
BEGIN;

-- ── colleges ───────────────────────────────────────────────────────────────
-- `code` is what `user_profiles.college` stores, so it is varchar(20) to match
-- that column exactly. A longer code would be accepted here and then silently
-- truncated or refused there.
CREATE TABLE IF NOT EXISTS public.colleges (
    college_id  serial PRIMARY KEY,
    code        varchar(20)  NOT NULL UNIQUE,
    name        varchar(255) NOT NULL,
    -- The sidebar badge colours, which lived in frontend/src/lib/college.ts as
    -- a Record keyed by the four codes. A college added by an administrator
    -- had no entry there, so its badge simply did not render. Carrying the two
    -- colours as data means a new college looks like the others on day one.
    badge_bg    varchar(16)  NOT NULL DEFAULT '#eef1f4',
    badge_color varchar(16)  NOT NULL DEFAULT '#334155',
    sort_order  integer      NOT NULL DEFAULT 0,
    -- ACTIVE, NOT DELETED. Turning a college off removes it from the dropdowns
    -- for new edits; every profile already storing that code keeps working and
    -- keeps displaying. Deletion is offered by the API only when nothing
    -- references the row. No administrator action may silently change what is
    -- stored in another teacher's profile.
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- ── courses ────────────────────────────────────────────────────────────────
-- A course belongs to exactly one college, which is how the Edit Profile
-- screen already behaves: choosing a college filters the Course dropdown.
CREATE TABLE IF NOT EXISTS public.courses (
    course_id  serial PRIMARY KEY,
    college_id integer      NOT NULL REFERENCES public.colleges(college_id) ON DELETE CASCADE,
    name       varchar(255) NOT NULL,
    sort_order integer      NOT NULL DEFAULT 0,
    active     boolean      NOT NULL DEFAULT true,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT courses_college_name_key UNIQUE (college_id, name)
);
CREATE INDEX IF NOT EXISTS courses_college_id_idx ON public.courses (college_id);

-- ── year levels ────────────────────────────────────────────────────────────
-- PER COLLEGE, which makes real a rule that until now existed only as a
-- comment in app/schemas/profile.py and a filter in the browser:
--
--     "CVMAS reaches 6th year (Doctor of Veterinary Medicine); the other
--      colleges reach 3rd. The per-college limit is enforced in the UI."
--
-- Enforced in the UI means not enforced. The seed below reproduces exactly
-- that rule, and the API now checks it.
CREATE TABLE IF NOT EXISTS public.year_levels (
    year_level_id serial PRIMARY KEY,
    college_id    integer     NOT NULL REFERENCES public.colleges(college_id) ON DELETE CASCADE,
    level         smallint    NOT NULL,
    label         varchar(32) NOT NULL,
    active        boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT year_levels_college_level_key UNIQUE (college_id, level),
    -- Matches user_profiles_year_level_check, which is kept. A year level the
    -- profile column could not store must not be offerable.
    CONSTRAINT year_levels_level_check CHECK (level >= 1 AND level <= 6)
);
CREATE INDEX IF NOT EXISTS year_levels_college_id_idx ON public.year_levels (college_id);

-- ── seed: EXACTLY what is hardcoded today ──────────────────────────────────
-- Codes and labels from frontend/src/types/profile.ts (COLLEGE_OPTIONS,
-- COURSES_BY_COLLEGE); colours from frontend/src/lib/college.ts
-- (COLLEGE_COLORS). Copied character for character. If a single label differs,
-- a teacher whose profile stores the old string sees a dropdown that cannot
-- reproduce their own saved value.
INSERT INTO public.colleges (code, name, badge_bg, badge_color, sort_order) VALUES
    ('CVMAS', 'College of Veterinary Medicine and Agricultural Sciences (CVMAS)', '#e1f5ee', '#0f6e56', 1),
    ('CBMA',  'College of Business, Management, and Accountancy (CBMA)',          '#eeedfe', '#534ab7', 2),
    ('CoEd',  'College of Education (CoEd)',                                      '#faeeda', '#854f0b', 3),
    ('CAST',  'College of Arts, Sciences and Technology (CAST)',                  '#faece7', '#993c1d', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.courses (college_id, name, sort_order)
SELECT c.college_id, v.name, v.sort_order
  FROM (VALUES
    ('CVMAS', 'Doctor of Veterinary Medicine', 1),
    ('CVMAS', 'Bachelor of Science in Food Technology', 2),
    ('CVMAS', 'Bachelor of Science in Agriculture', 3),
    ('CBMA',  'Bachelor of Science in Accountancy', 1),
    ('CBMA',  'Bachelor of Science in Business Administration', 2),
    ('CBMA',  'Bachelor of Science in Business Administration: Major in Financial Management', 3),
    ('CBMA',  'Bachelor of Science in Business Administration: Major in Marketing Management', 4),
    ('CBMA',  'Bachelor of Science in Hospitality Management', 5),
    ('CBMA',  'Bachelor of Science in Tourism Management', 6),
    ('CoEd',  'Bachelor of Elementary Education', 1),
    ('CoEd',  'Bachelor of Secondary Education', 2),
    ('CoEd',  'Major in Filipino', 3),
    ('CoEd',  'Major in Mathematics', 4),
    ('CoEd',  'Major in Physical Science', 5),
    ('CAST',  'Bachelor of Science in Computer Science', 1),
    ('CAST',  'Bachelor of Science in Computer Engineering', 2),
    ('CAST',  'Bachelor of Arts in Psychology', 3)
  ) AS v(code, name, sort_order)
  JOIN public.colleges c ON c.code = v.code
ON CONFLICT (college_id, name) DO NOTHING;

-- CVMAS to 6th year, every other college to 3rd - the rule the UI enforced.
INSERT INTO public.year_levels (college_id, level, label)
SELECT c.college_id, v.level, v.label
  FROM (VALUES (1, '1st Year'), (2, '2nd Year'), (3, '3rd Year'),
               (4, '4th Year'), (5, '5th Year'), (6, '6th Year')) AS v(level, label)
  CROSS JOIN public.colleges c
 WHERE c.code = 'CVMAS' OR v.level <= 3
ON CONFLICT (college_id, level) DO NOTHING;

-- ── the constraint that would have made all of the above inert ─────────────
ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_college_check;

COMMIT;

-- ---------------------------------------------------------------------------
-- AFTER RUNNING, CHECK THE SEED AGAINST WHAT THE SCREENS USED TO OFFER:
--
--   SELECT code, name, active FROM colleges ORDER BY sort_order;      -- 4 rows
--   SELECT c.code, count(*) FROM courses x JOIN colleges c USING (college_id)
--     GROUP BY c.code ORDER BY c.code;   -- CAST 3, CBMA 6, CVMAS 3, CoEd 5
--   SELECT c.code, count(*) FROM year_levels y JOIN colleges c USING (college_id)
--     GROUP BY c.code ORDER BY c.code;   -- CAST 3, CBMA 3, CVMAS 6, CoEd 3
--
-- There is deliberately no API that creates the FIRST college - this seed is
-- it. An installation with zero colleges would have an unusable Edit Profile
-- screen, so the lists are never allowed to start empty.
-- ---------------------------------------------------------------------------
