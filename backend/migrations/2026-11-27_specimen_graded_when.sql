-- 2026-11-27_specimen_graded_when.sql
-- ===========================================================================
-- READ ONLY. No INSERT, no UPDATE, no DELETE, no DROP.
--
--     docker exec -i learnlens_db sh -c \
--       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-27_specimen_graded_when.sql
--
-- ROUND THREE. paper_scores.graded_at exists, so every row can be placed on
-- either side of the moment the rule went live:
--
--     2026-11-20 11:45:51.159046+00
--
-- A row graded BEFORE that was judged without the rule, whatever it says
-- now. A row graded after MAY have passed through it.
--
-- QUERY 3 IS THE ONE THAT DECIDES whether 31 minutes of OCR is worth
-- spending. If the 51 correct D-marks were all graded before the rule
-- existed, there is nothing to re-check and this ends here.
--
-- QUERY 4 IS THE CONTROL for round two's query C. Zero bare hyphens in the
-- whole table has two possible causes and they point opposite ways:
--     (a) the reader never emits one, so the rule never fired; or
--     (b) the rule rewrote every one of them, so none survive.
-- Only rows PREDATING the rule can tell them apart - if there are no such
-- rows, query C proved nothing and should not be leaned on.
-- ===========================================================================
\set RULE '2026-11-20 11:45:51.159046+00'

\echo ''
\echo '=== 1. when was anything in paper_scores graded? =================='
SELECT min(graded_at)                                           AS earliest,
       max(graded_at)                                           AS latest,
       count(*)                                                 AS rows_total,
       count(*) FILTER (WHERE graded_at <  :'RULE'::timestamptz) AS before_the_rule,
       count(*) FILTER (WHERE graded_at >= :'RULE'::timestamptz) AS after_the_rule,
       count(*) FILTER (WHERE graded_at IS NULL)                AS no_timestamp
FROM   paper_scores;

\echo ''
\echo '=== 2. the same split, papers rather than rows ===================='
SELECT count(DISTINCT paper_id) FILTER (WHERE graded_at <  :'RULE'::timestamptz)
         AS papers_graded_before,
       count(DISTINCT paper_id) FILTER (WHERE graded_at >= :'RULE'::timestamptz)
         AS papers_graded_after
FROM   paper_scores;

\echo ''
\echo '=== 3. THE DECIDING QUERY: the 51 correct D-marks, by side ========'
\echo '    after_the_rule is the only number that can be wrong. If it is 0,'
\echo '    the rule never touched a mark and nothing needs re-checking.'
SELECT count(*)                                                  AS correct_d_marks,
       count(*) FILTER (WHERE graded_at <  :'RULE'::timestamptz) AS before_the_rule,
       count(*) FILTER (WHERE graded_at >= :'RULE'::timestamptz) AS after_the_rule,
       count(DISTINCT paper_id) FILTER (WHERE graded_at >= :'RULE'::timestamptz)
         AS papers_to_re_check
FROM   paper_scores
WHERE  upper(btrim(student_answer)) = 'D'
  AND  upper(btrim(coalesce(correct_answer, ''))) = 'D'
  AND  is_correct;

\echo ''
\echo '=== 4. CONTROL: what the reader produced BEFORE the rule existed ==='
\echo '    If this is empty, round two query C told us nothing - there were'
\echo '    no pre-rule rows left for a hyphen to survive in.'
SELECT btrim(student_answer) AS reading,
       count(*)              AS rows
FROM   paper_scores
WHERE  graded_at < :'RULE'::timestamptz
  AND  length(btrim(coalesce(student_answer, ''))) <= 2
GROUP  BY 1
ORDER  BY rows DESC
LIMIT  20;

\echo ''
\echo '=== 5. and the whole vocabulary of short readings, both sides ======'
\echo '    A dash in any form showing up here is the thing to look for.'
SELECT btrim(student_answer) AS reading,
       count(*)              AS rows,
       min(graded_at)        AS first_seen,
       max(graded_at)        AS last_seen
FROM   paper_scores
WHERE  length(btrim(coalesce(student_answer, ''))) <= 2
GROUP  BY 1
ORDER  BY rows DESC
LIMIT  25;

\echo ''
\echo '=== 6. if there IS something to re-check, this is the list ========='
SELECT tp.paper_id,
       e.exam_id,
       e.exam_name,
       count(*)       AS correct_d_marks,
       min(ps.graded_at) AS graded
FROM   paper_scores ps
JOIN   test_papers tp ON tp.paper_id = ps.paper_id
JOIN   exams e        ON e.exam_id   = tp.exam_id
WHERE  upper(btrim(ps.student_answer)) = 'D'
  AND  upper(btrim(coalesce(ps.correct_answer, ''))) = 'D'
  AND  ps.is_correct
  AND  ps.graded_at >= :'RULE'::timestamptz
GROUP  BY tp.paper_id, e.exam_id, e.exam_name
ORDER  BY correct_d_marks DESC, tp.paper_id;
\echo ''
