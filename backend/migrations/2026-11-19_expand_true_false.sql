-- LearnLens — migration 2026-11-19 (second of the day)
-- ====================================================
-- Expand historical T / F to TRUE / FALSE in paper_scores.
--
--     Sir Alex Passion, 19 November 2026, page 1 item 3:
--       "Correct display in Test Paper — TRUE instead of T"
--
-- WHY THIS EXISTS, WHEN THE CODE WAS ALREADY FIXED THIS MORNING
-- -------------------------------------------------------------
-- grader.py now keeps the word: `_is_true_false(raw_key)` decides, and
-- `_expand()` writes TRUE / FALSE into paper_scores. But that only affects
-- papers checked FROM THEN ON. Measured on production, 2026-11-19:
--
--     seen   | items | papers
--     -------+-------+--------
--     T      |   371 |     21
--     F      |   229 |     20
--     TRUE   |     4 |      1     <- the one paper re-checked after the fix
--
-- So twenty-one papers still display T. Opening any of them shows exactly the
-- fault that was reported. The code fix is correct and incomplete: the data it
-- was supposed to improve was written before it existed.
--
-- WHY NOT A SPECIMEN CORRECTION ROW ("T means TRUE")
-- ---------------------------------------------------
-- Because ocr_corrections is keyed on the READING ALONE and knows nothing
-- about the item. Two ways that goes wrong, both of them silent:
--
--   * MIXED_LETTERS is "ABCDEFT". A bare F is also a MATCHING-TYPE answer.
--     A global F -> FALSE row would rewrite matching items where F is the
--     correct answer. 229 items across 20 papers are at stake.
--
--   * For rows written before this morning, `correct_answer` was stored
--     FOLDED too - `_norm` turned the key TRUE into T before it was saved.
--     Correcting the student's T to TRUE against a key still reading T gives
--     similarity('TRUE','T') = 0.25, below REVIEW_FLOOR, so the row would be
--     marked WRONG. A correction row would flip hundreds of correct answers
--     to wrong in a single click.
--
-- This migration expands BOTH SIDES TOGETHER, so equality is preserved and
-- `is_correct` cannot move. It never touches is_correct or verdict at all.
--
-- HOW IT DECIDES WHAT IS A TRUE/FALSE ITEM
-- -----------------------------------------
-- By the ANSWER KEY, never by the student's letter - the same authority
-- `grader._is_true_false()` uses, and for the same reason: a matching-type F
-- must stay F. An item whose key is not literally TRUE or FALSE is left
-- alone, which also means this migration mirrors the running code exactly. If
-- some old exam stored its key as 'T', `_is_true_false` returns False for it
-- too, so the live grader would not expand it either; leaving it is correct,
-- not an oversight.
--
-- Run with the backend STOPPED:
--   docker exec -i learnlens_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-19_expand_true_false.sql
--
-- Safe to run twice: the second run matches no rows.

BEGIN;

-- What is about to change, printed BEFORE it changes.
SELECT count(*) AS rows_to_expand
FROM public.paper_scores ps
JOIN public.answer_keys ak ON ak.answer_key_id = ps.answer_key_id
WHERE upper(btrim(ak.correct_answer)) IN ('TRUE', 'FALSE')
  AND (upper(btrim(ps.student_answer)) IN ('T', 'F')
       OR upper(btrim(ps.correct_answer)) IN ('T', 'F'));

UPDATE public.paper_scores ps
SET student_answer = CASE upper(btrim(ps.student_answer))
                       WHEN 'T' THEN 'TRUE'
                       WHEN 'F' THEN 'FALSE'
                       ELSE ps.student_answer
                     END,
    correct_answer = CASE upper(btrim(ps.correct_answer))
                       WHEN 'T' THEN 'TRUE'
                       WHEN 'F' THEN 'FALSE'
                       ELSE ps.correct_answer
                     END
FROM public.answer_keys ak
WHERE ak.answer_key_id = ps.answer_key_id
  AND upper(btrim(ak.correct_answer)) IN ('TRUE', 'FALSE')
  AND (upper(btrim(ps.student_answer)) IN ('T', 'F')
       OR upper(btrim(ps.correct_answer)) IN ('T', 'F'));

-- Nothing should be left.
SELECT count(*) AS rows_still_folded
FROM public.paper_scores ps
JOIN public.answer_keys ak ON ak.answer_key_id = ps.answer_key_id
WHERE upper(btrim(ak.correct_answer)) IN ('TRUE', 'FALSE')
  AND (upper(btrim(ps.student_answer)) IN ('T', 'F')
       OR upper(btrim(ps.correct_answer)) IN ('T', 'F'));

COMMIT;

-- ---------------------------------------------------------------------------
-- DELIBERATELY NOT DONE
--
--   * is_correct and verdict are NOT recomputed, and not written at all.
--     Both sides of every rewritten row move together - T/T becomes
--     TRUE/TRUE, T/F becomes TRUE/FALSE - so every equality that held still
--     holds and every one that did not still does not. A migration that
--     rewrote marks would be a different and far more dangerous thing.
--
--   * A BLANK (U+2014 EM DASH) is not touched. It is not T or F.
--
--   * A CONTESTED reading such as 'T|F' is not touched: it does not equal
--     'T' or 'F', so the predicate skips it. It is already visibly contested
--     on screen and is scored wrong either way. Expanding it would mean
--     parsing and rejoining the parts for a cosmetic gain on a handful of
--     rows - 12 in production - and is not worth the risk.
--
--   * answer_keys itself is NOT modified. Its stored key is already the word.
--
-- Rollback (exact inverse, same predicate):
--   BEGIN;
--   UPDATE public.paper_scores ps
--   SET student_answer = CASE upper(btrim(ps.student_answer))
--                          WHEN 'TRUE' THEN 'T' WHEN 'FALSE' THEN 'F'
--                          ELSE ps.student_answer END,
--       correct_answer = CASE upper(btrim(ps.correct_answer))
--                          WHEN 'TRUE' THEN 'T' WHEN 'FALSE' THEN 'F'
--                          ELSE ps.correct_answer END
--   FROM public.answer_keys ak
--   WHERE ak.answer_key_id = ps.answer_key_id
--     AND upper(btrim(ak.correct_answer)) IN ('TRUE','FALSE');
--   COMMIT;
--
--   NOTE: the rollback is NOT selective about which rows were expanded by
--   this migration, so it would also fold the one paper that was checked
--   after the code fix. That is the correct behaviour for a rollback - it
--   restores the state the application produced before 2026-11-19 - but it is
--   stated here rather than discovered.
-- ---------------------------------------------------------------------------
