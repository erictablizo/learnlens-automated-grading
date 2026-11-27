-- 2026-11-27_specimen_which_papers.sql
-- ===========================================================================
-- READ ONLY. No INSERT, no UPDATE, no DELETE, no DROP.
--
--     docker exec -i learnlens_db sh -c \
--       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-27_specimen_which_papers.sql
--
-- ROUND TWO, AND IT ASKS THE OPPOSITE QUESTION TO ROUND ONE.
--
-- The first file's query 3 looked for rows reading "D" where the key is NOT
-- D, and called them the damage. That was backwards, and the comment above
-- it said so in writing, which makes it worse:
--
--     rule fires, key is NOT D  ->  wrong before (a dash is not A either),
--                                   wrong after. The rule changed nothing.
--     rule fires, key IS D      ->  WRONG before, CORRECT after. A mark was
--                                   awarded on a reading the reader did not
--                                   actually make.
--
-- So the five rows it found are the harmless ones, and the exposure is in
-- the other fifty-one. This file goes looking for a way to tell which of
-- those fifty-one the rule touched - WITHOUT re-reading any image, because
-- that is the expensive and destructive option and it should be the last
-- one considered, not the first.
-- ===========================================================================
\echo ''
\echo '=== A. what columns exist, so the next query can be written ========'
\echo '    Specifically: is there a timestamp that says WHEN a paper was'
\echo '    checked? The rule went live 2026-11-20 11:45:51+00. A paper'
\echo '    checked before that cannot have been touched by it, and that'
\echo '    alone may cut the list to nothing.'
SELECT table_name, column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name IN ('paper_scores', 'test_papers')
  AND  (data_type LIKE 'timestamp%' OR column_name IN
        ('paper_id','score_id','checked','total_score','student_answer',
         'correct_answer','is_correct','verdict','ocr_confidence'))
ORDER  BY table_name, ordinal_position;

\echo ''
\echo '=== B. the fifty-one, split by what the mark actually is ==========='
\echo '    marked_correct is the number that would DROP if every one of'
\echo '    them turned out to be a promoted dash. It is the worst case, not'
\echo '    a finding - most are students who really did circle D.'
SELECT (upper(btrim(coalesce(correct_answer, ''))) = 'D') AS key_is_d,
       count(*)                              AS rows,
       count(DISTINCT paper_id)              AS papers,
       count(*) FILTER (WHERE is_correct)    AS marked_correct
FROM   paper_scores
WHERE  upper(btrim(student_answer)) = 'D'
GROUP  BY 1
ORDER  BY 1;

\echo ''
\echo '=== C. is the reader still producing bare hyphens at all? =========='
\echo '    Rows reading "-" can only predate the rule, because after it the'
\echo '    pass rewrote every one of them to D. A healthy count here means'
\echo '    the reader does emit hyphens and the rule had something to bite'
\echo '    on; zero means it may never have fired.'
SELECT count(*)                    AS hyphen_readings,
       count(DISTINCT paper_id)    AS papers
FROM   paper_scores
WHERE  btrim(student_answer) = '-';

\echo ''
\echo '=== D. what the D-readings are actually sitting on ================='
\echo '    An encircled item reads a letter directly and never needed the'
\echo '    rule. The rule was written for HANDWRITING ("Handwritten D read'
\echo '    as Dash"), so a single-letter identification key is where it'
\echo '    could have fired. Grouping by key length separates the two.'
SELECT length(btrim(coalesce(ps.correct_answer, ''))) AS key_length,
       count(*)                                       AS rows,
       count(DISTINCT ps.paper_id)                    AS papers,
       count(*) FILTER (WHERE ps.is_correct)          AS marked_correct
FROM   paper_scores ps
WHERE  upper(btrim(ps.student_answer)) = 'D'
GROUP  BY 1
ORDER  BY 1;

\echo ''
\echo '=== E. the exams those papers belong to ============================'
SELECT e.exam_id,
       e.exam_name,
       count(DISTINCT ps.paper_id) AS papers_with_a_D,
       count(*)                    AS rows
FROM   paper_scores ps
JOIN   test_papers tp ON tp.paper_id = ps.paper_id
JOIN   exams e        ON e.exam_id   = tp.exam_id
WHERE  upper(btrim(ps.student_answer)) = 'D'
GROUP  BY e.exam_id, e.exam_name
ORDER  BY rows DESC;
\echo ''
