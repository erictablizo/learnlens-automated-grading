-- LearnLens — migration 2026-11-20
-- =================================
-- answer_keys.points — what one item is worth.
--
--     Sir Alex Passion, Recommendations page 12:
--       "1 item equivalent to how many points = Drop-down List for 1..10"
--       "Total Points on this page (Computed)"
--       "the equivalent points per item will be used in the computation of
--        total scores of each Student."
--
-- and his page 1 item 1: "Requirements - handling points (2 pts).
-- Items = Equivalent Points."
--
-- WHY PER ITEM, WHEN THE SCREEN ASKS PER PAGE
-- --------------------------------------------
-- The modal he drew has ONE dropdown for a whole page, and that is what will
-- be built. The value is stored on every answer_keys row of that page rather
-- than on the page itself, for one reason:
--
--   his page 2 says "Test I = 2 pts, Test II = 10 pts", and on the English
--   101 sheet Test I is items 1-10 and Test II is items 11-15 - BOTH ON
--   PAGE 1. A single per-page value cannot express his own example.
--
-- Storing per item makes that a future UI change instead of a future
-- migration plus a re-grade of every paper. The screen stays exactly as he
-- drew it; the data is ready for the question he has not been asked yet.
--
-- DEFAULT 1, NOT NULL, and that is the whole backwards-compatibility story:
-- every existing item is worth 1 point, which is what the system already
-- assumes, so no score can move when this runs.
--
-- Run with the backend STOPPED:
--   docker exec -i learnlens_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-20_answer_key_points.sql
--
-- Safe to run twice.

BEGIN;

ALTER TABLE public.answer_keys
    ADD COLUMN IF NOT EXISTS points smallint DEFAULT 1 NOT NULL;

DO $$
BEGIN
    -- The dropdown offers 1 to 10. The database refuses anything else, so a
    -- future caller cannot make an item worth 0 (silently unscorable) or 500
    -- (silently dominating the paper).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_answer_keys_points_range') THEN
        ALTER TABLE public.answer_keys
            ADD CONSTRAINT ck_answer_keys_points_range
            CHECK (points BETWEEN 1 AND 10);
    END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES NOT DO, ON PURPOSE
--
--   * It does not touch paper_scores. A recorded answer does not carry a
--     points value; it carries `answer_key_id`, and the points come from
--     the key. One source of truth - a copy on paper_scores would drift the
--     first time a teacher changed an item's worth after checking.
--
--   * It does not recompute any total_score. Every row defaults to 1, which
--     is what the grader already assumed, so every existing score is already
--     correct under the new arithmetic. Verify with:
--
--       SELECT count(*) FROM test_papers tp WHERE tp.checked
--        AND tp.total_score IS DISTINCT FROM (
--              SELECT coalesce(sum(ak.points), 0)
--              FROM paper_scores ps
--              JOIN answer_keys ak ON ak.answer_key_id = ps.answer_key_id
--              WHERE ps.paper_id = tp.paper_id AND ps.is_correct);
--
--     That must return 0 both before and after the application change.
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE public.answer_keys DROP CONSTRAINT IF EXISTS ck_answer_keys_points_range;
--   ALTER TABLE public.answer_keys DROP COLUMN IF EXISTS points;
--   COMMIT;
--
--   Safe only while nothing reads the column. After the application change
--   ships, rolling this back needs the code rolled back with it.
-- ---------------------------------------------------------------------------
