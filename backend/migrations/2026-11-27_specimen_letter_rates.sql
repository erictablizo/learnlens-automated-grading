-- 2026-11-27_specimen_letter_rates.sql
-- ===========================================================================
-- READ ONLY. No INSERT, no UPDATE, no DELETE, no DROP.
--
--     docker exec -i learnlens_db sh -c \
--       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-27_specimen_letter_rates.sql
--
-- ROUND FOUR, and this one does not depend on timestamps at all.
--
-- THE ARGUMENT. If the rule was firing, dashes became D. A promoted dash
-- lands on a D-key only by luck - roughly one time in four on a four-option
-- item - so a stream of them would DILUTE D's accuracy relative to A, B and
-- C, which have no such contaminating source.
--
--     D behaves like the other letters  ->  no sign of a second source
--     D is conspicuously less accurate  ->  something is feeding it
--
-- This is evidence, not proof: an answer key can be lopsided and students
-- are not random. But it costs one query against 465 rows instead of half
-- an hour of OCR, and if D sits in line with its siblings that is a real
-- reason not to spend the half hour.
--
-- Query 3 is the before-picture for the one-paper probe. Run this file
-- again after re-checking paper 71 and compare: every row should be
-- identical unless the rule was firing on it.
-- ===========================================================================
\echo ''
\echo '=== 1. accuracy by letter - is D the odd one out? ================='
\echo '    hit_rate is how often a reading of that letter sat on a key of'
\echo '    that letter. D is the only one the rule could have fed.'
SELECT upper(btrim(student_answer))                       AS reading,
       count(*)                                           AS readings,
       count(*) FILTER (WHERE upper(btrim(coalesce(correct_answer, '')))
                              = upper(btrim(student_answer))) AS on_a_matching_key,
       round(100.0 * count(*) FILTER (WHERE upper(btrim(coalesce(correct_answer, '')))
                                            = upper(btrim(student_answer)))
             / nullif(count(*), 0), 1)                    AS hit_rate_pct
FROM   paper_scores
WHERE  upper(btrim(coalesce(student_answer, ''))) IN ('A', 'B', 'C', 'D')
GROUP  BY 1
ORDER  BY 1;

\echo ''
\echo '=== 2. the control: how often is each letter the KEY? ============='
\echo '    If D is simply a rarer answer, that shows up here and explains'
\echo '    any difference above without any rule being involved.'
SELECT upper(btrim(correct_answer)) AS key_letter,
       count(*)                     AS items
FROM   paper_scores
WHERE  upper(btrim(coalesce(correct_answer, ''))) IN ('A', 'B', 'C', 'D')
GROUP  BY 1
ORDER  BY 1;

\echo ''
\echo '=== 3. BEFORE-PICTURE for the probe: every row on paper 71 ========'
\echo '    Re-check paper 71 in the UI, run this file again, and compare.'
\echo '    Any row whose student_answer changes is a reading the rule had'
\echo '    rewritten. No change means it never fired on this paper.'
SELECT question_number AS item,
       student_answer  AS reading,
       correct_answer  AS key,
       is_correct,
       verdict,
       ocr_confidence  AS conf
FROM   paper_scores
WHERE  paper_id = 71
ORDER  BY question_number;

\echo ''
\echo '=== 4. and its score, which is the headline number to compare ====='
SELECT tp.paper_id,
       tp.total_score,
       tp.checked,
       count(*)                           AS items,
       count(*) FILTER (WHERE ps.is_correct) AS correct
FROM   test_papers tp
JOIN   paper_scores ps ON ps.paper_id = tp.paper_id
WHERE  tp.paper_id = 71
GROUP  BY tp.paper_id, tp.total_score, tp.checked;

\echo ''
\echo '=== 5. the global figure, so a change anywhere is visible ========='
SELECT count(*) FILTER (WHERE upper(btrim(student_answer)) = 'D')  AS d_readings,
       count(*) FILTER (WHERE upper(btrim(student_answer)) = 'D'
                          AND is_correct)                          AS d_correct,
       count(*)                                                    AS all_rows
FROM   paper_scores;
\echo ''
