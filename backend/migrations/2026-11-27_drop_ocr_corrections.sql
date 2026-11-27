-- migrations/2026-11-27_drop_ocr_corrections.sql
-- ===========================================================================
-- Sir Alex Passion, 27 November 2026: the specimen-correction table is not
-- needed, because the focus is encircled answers.
--
-- OPTIONAL, AND NOT PART OF THE CODE CHANGE. After
-- apply_2026-11-27_specimen_removal.py the table is read by nothing and
-- written by nothing; it simply sits there, costing nothing. This drops it.
--
-- DO NOT RUN THIS BEFORE THE DEFENCE unless you want to. A dropped table is
-- not something a rollback brings back, and there is no benefit to being in a
-- hurry about an empty-handed table on 27 November when the defence is on
-- 3 December. Run it on the 4th.
--
--     docker exec -i learnlens_db sh -c \
--       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < migrations/2026-11-27_drop_ocr_corrections.sql
--
-- WHAT IT MUST NOT TOUCH: ocr_correction_samples. That is a different table,
-- it is live, and Ms. Melanie's page 19 requirement 1 counts its rows. The
-- names differ by one word, which is the whole reason this file names both.
-- ===========================================================================
BEGIN;

-- Say out loud what is about to go, and how much of it there is.
DO $$
DECLARE
    n integer;
BEGIN
    IF to_regclass('public.ocr_corrections') IS NULL THEN
        RAISE NOTICE 'ocr_corrections does not exist; nothing to drop.';
    ELSE
        EXECUTE 'SELECT count(*) FROM ocr_corrections' INTO n;
        RAISE NOTICE 'Dropping ocr_corrections (% row(s)).', n;
    END IF;
END $$;

-- A guard, not a formality. If this ever selects the wrong table the
-- transaction stops here rather than at the DROP.
DO $$
BEGIN
    IF to_regclass('public.ocr_correction_samples') IS NULL THEN
        RAISE EXCEPTION
            'ocr_correction_samples is missing - refusing to drop anything. '
            'That table is live (Melanie, page 19 req 1) and its absence '
            'means this is not the database I think it is.';
    END IF;
END $$;

DROP TABLE IF EXISTS ocr_corrections;

-- Prove the right one went and the right one stayed.
DO $$
BEGIN
    IF to_regclass('public.ocr_corrections') IS NOT NULL THEN
        RAISE EXCEPTION 'ocr_corrections is still here.';
    END IF;
    IF to_regclass('public.ocr_correction_samples') IS NULL THEN
        RAISE EXCEPTION 'ocr_correction_samples went with it. Rolling back.';
    END IF;
    RAISE NOTICE 'ocr_corrections dropped; ocr_correction_samples intact.';
END $$;

COMMIT;
