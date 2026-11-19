-- LearnLens — migration 2026-11-19 (third of the day)
-- ====================================================
-- Expand folded T / F ANSWER KEYS to TRUE / FALSE.
--
-- RUN THIS BEFORE 2026-11-19_expand_true_false.sql. That migration expands
-- paper_scores for items whose KEY reads TRUE or FALSE; with the keys
-- themselves folded it matched nothing (measured on production: UPDATE 0).
-- This is the missing first half.
--
-- WHY THE KEYS ARE THE ROOT CAUSE
-- --------------------------------
-- `grader._is_true_false(raw_key)` tests `raw_key in ("TRUE","FALSE")`. For a
-- key reading 'T' it returns FALSE, so `_expand()` never runs and the item is
-- not treated as true/false at all. The 2026-11-19 display fix is therefore
-- INERT for every exam whose keys are folded - re-checking those papers would
-- store 'T' all over again.
--
-- Measured on production, 2026-11-19:
--
--   exam | page |    part_type       | folded | expanded | items | distinct_keys
--   -----+------+--------------------+--------+----------+-------+---------------------
--      4 |    1 | (no part declared) |      0 |        0 |    15 | A B C D
--      5 |    1 | (no part declared) |     30 |        0 |    30 | F T          <-- this
--      6 |    1 | (no part declared) |      0 |        0 |    15 | A B C D
--      7 |    1 | (no part declared) |      0 |        0 |    15 | A B C D
--      8 |    1 | (no part declared) |      0 |        0 |    15 | A B C D
--      8 |    2 | (no part declared) |      0 |        5 |    10 | A B C D E FALSE TRUE
--
-- One page. Thirty items. No A-E anywhere on it.
--
-- HOW IT DECIDES, GIVEN THAT exam_page_parts IS EMPTY
-- ----------------------------------------------------
-- By the WHOLE PAGE, not by the individual key - because an individual 'T'
-- is genuinely ambiguous (MIXED_LETTERS is "ABCDEFT", so T and F are also
-- matching-type letters) and a page is not. A page qualifies only when:
--
--   * EVERY key on it reads T or F, and
--   * it has at least five items.
--
-- A matching-type page has A-E mixed in, so it cannot qualify. The five-item
-- floor exists because a two-item matching page whose answers happened to be
-- T and F would be indistinguishable from a true/false page by this rule;
-- below five, this migration declines to guess and leaves the page for a
-- human. Exam 5's page has thirty.
--
-- If exam_page_parts is ever populated, THAT becomes the authority and this
-- page-shape rule should be replaced by it. It is an inference, correct for
-- the data measured above, and it is written down as an inference.
--
-- Run with the backend STOPPED:
--   docker exec -i learnlens_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-19_expand_true_false_keys.sql
--
-- Safe to run twice: the second run matches no page.

BEGIN;

-- Exactly which pages qualify, and what is on them. Printed BEFORE anything
-- changes, so the inference above can be checked against the data.
SELECT ak.page_id,
       count(*) AS items,
       string_agg(DISTINCT upper(btrim(ak.correct_answer)), ' '
                  ORDER BY upper(btrim(ak.correct_answer))) AS distinct_keys
FROM public.answer_keys ak
GROUP BY ak.page_id
HAVING count(*) >= 5
   AND bool_and(upper(btrim(ak.correct_answer)) IN ('T', 'F'))
ORDER BY ak.page_id;

WITH tf_pages AS (
    SELECT ak.page_id
    FROM public.answer_keys ak
    GROUP BY ak.page_id
    HAVING count(*) >= 5
       AND bool_and(upper(btrim(ak.correct_answer)) IN ('T', 'F'))
)
UPDATE public.answer_keys ak
SET correct_answer = CASE upper(btrim(ak.correct_answer))
                       WHEN 'T' THEN 'TRUE'
                       WHEN 'F' THEN 'FALSE'
                       ELSE ak.correct_answer
                     END
FROM tf_pages
WHERE ak.page_id = tf_pages.page_id;

-- Nothing should qualify any more.
SELECT count(*) AS pages_still_folded
FROM (
    SELECT ak.page_id
    FROM public.answer_keys ak
    GROUP BY ak.page_id
    HAVING count(*) >= 5
       AND bool_and(upper(btrim(ak.correct_answer)) IN ('T', 'F'))
) q;

COMMIT;

-- ---------------------------------------------------------------------------
-- WHAT THIS CHANGES DOWNSTREAM, DELIBERATELY
--
--   * `_is_true_false()` now returns True for these items, so every FUTURE
--     check stores TRUE / FALSE. Without this, re-checking exam 5 would put
--     'T' straight back.
--
--   * Grading is UNAFFECTED. `grade_detected` compares `_norm(student)` with
--     `_norm(key)`, and `_norm` folds TRUE back to T. 'TRUE' and 'T' are the
--     same value to the comparison, so no mark can move.
--
--   * The Answer Key screen will show TRUE / FALSE instead of T / F, which is
--     what Sir Alex asked for in the first place, and AnswerKeyPanel's
--     expandTF() guard starts working on these items - it only expands a
--     typed T when the item's current key is already TRUE or FALSE.
--
-- WHAT IT DOES NOT DO
--
--   * It does not touch paper_scores. Run 2026-11-19_expand_true_false.sql
--     next; it will now match, because the keys read TRUE and FALSE.
--
--   * It does not touch a page with any A-E key on it, including exam 8
--     page 2, whose true/false keys are already words.
--
-- Rollback:
--   BEGIN;
--   WITH tf_pages AS (
--       SELECT ak.page_id FROM public.answer_keys ak GROUP BY ak.page_id
--       HAVING count(*) >= 5
--          AND bool_and(upper(btrim(ak.correct_answer)) IN ('TRUE','FALSE')))
--   UPDATE public.answer_keys ak
--   SET correct_answer = CASE upper(btrim(ak.correct_answer))
--                          WHEN 'TRUE' THEN 'T' WHEN 'FALSE' THEN 'F'
--                          ELSE ak.correct_answer END
--   FROM tf_pages WHERE ak.page_id = tf_pages.page_id;
--   COMMIT;
--
--   NOTE: that rollback would also fold exam 8 page 2 if it were an all-word
--   page. It is not - it has A-E on it - so it is safe today. Check before
--   using it.
-- ---------------------------------------------------------------------------
