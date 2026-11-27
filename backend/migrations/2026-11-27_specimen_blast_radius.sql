-- 2026-11-27_specimen_blast_radius.sql
-- ===========================================================================
-- READ ONLY. No INSERT, no UPDATE, no DELETE, no DROP. Safe to run on
-- production, and safe to run twice.
--
--     docker exec -i learnlens_db sh -c \
--       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < 2026-11-27_specimen_blast_radius.sql
--
-- WHAT IT IS FOR. The specimen rule ("-" means "D") rewrote readings while
-- papers were being checked. It is gone now, so the question is whether any
-- paper is carrying a mark that came from it - and the honest answer is that
-- nobody knows yet, because the rewrite left no record on the row.
--
-- This measures the BLAST RADIUS before anything is done about it. A
-- re-check is destructive (it re-runs OCR and overwrites hand corrections),
-- so the number of rows that could possibly be affected should be known
-- first. It may well be zero.
--
-- ocr_corrections still exists and is read by nothing, which is why the
-- first query can still ask it when the rule was created.
-- ===========================================================================
\echo ''
\echo '=== 1. the specimen rows, and WHEN each went live ==================='
SELECT correction_id,
       seen,
       means,
       note,
       created_at
FROM   ocr_corrections
ORDER  BY created_at;

\echo ''
\echo '=== 2. readings that match a specimen MEANS ========================'
\echo '    ocr_confidence IS NULL  = a human typed it. NOT the rule.'
\echo '    ocr_confidence IS NOT NULL = the reader produced it, so it is a'
\echo '    candidate - though it may equally be a genuine reading of that'
\echo '    letter. This is an upper bound, not a count of damage.'
SELECT c.seen           AS rule_seen,
       c.means          AS rule_means,
       count(*)                                        AS matching_rows,
       count(*) FILTER (WHERE ps.ocr_confidence IS NULL) AS typed_by_a_human,
       count(*) FILTER (WHERE ps.ocr_confidence IS NOT NULL) AS from_the_reader,
       count(DISTINCT ps.paper_id)                     AS papers
FROM   ocr_corrections c
JOIN   paper_scores ps
       ON upper(btrim(ps.student_answer)) = upper(btrim(c.means))
GROUP  BY c.seen, c.means
ORDER  BY matching_rows DESC;

\echo ''
\echo '=== 3. of those, how many are actually WRONG right now ============='
\echo '    A reading the rule produced that happens to match the key is'
\echo '    marked correct and nobody is harmed. These are the ones where it'
\echo '    does not match.'
SELECT c.means                     AS rule_means,
       ps.correct_answer           AS key_says,
       count(*)                    AS rows,
       count(DISTINCT ps.paper_id) AS papers
FROM   ocr_corrections c
JOIN   paper_scores ps
       ON upper(btrim(ps.student_answer)) = upper(btrim(c.means))
WHERE  ps.ocr_confidence IS NOT NULL
  AND  upper(btrim(coalesce(ps.correct_answer, ''))) <> upper(btrim(c.means))
GROUP  BY c.means, ps.correct_answer
ORDER  BY rows DESC;

\echo ''
\echo '=== 4. the evidence table is alive - this is the removal check ====='
\echo '    The Corrections-by-teacher panel reads these. A row here with a'
\echo '    zero in the CORRECTIONS column just means the paper that row came'
\echo '    from has since been re-checked, which deletes paper_scores.'
SELECT count(*)                           AS sample_rows,
       count(DISTINCT corrected_by)       AS teachers,
       count(*) FILTER (WHERE score_id IS NULL) AS orphaned_by_a_recheck,
       min(created_at)                    AS first,
       max(created_at)                    AS last
FROM   ocr_correction_samples;

\echo ''
\echo '=== 5. and how many hand corrections survive in paper_scores ======='
\echo '    ocr_confidence IS NULL is the marker. If this is 0 while query 4'
\echo '    shows rows, every paper that had one has been re-checked since.'
SELECT count(*)                    AS hand_typed_answers,
       count(DISTINCT paper_id)    AS papers
FROM   paper_scores
WHERE  ocr_confidence IS NULL;
\echo ''
