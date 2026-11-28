-- 2026-11-28_what_depends_on_students.sql
-- ===========================================================================
-- READ ONLY. No INSERT, no UPDATE, no DELETE, no TRUNCATE, no DROP.
--
--     docker exec -i learnlens_db sh -c \
--       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < backend/migrations/2026-11-28_what_depends_on_students.sql
--
-- WHY THIS COMES FIRST.  `TRUNCATE <parent> CASCADE` in PostgreSQL does not
-- warn and does not stop. It empties every table with a foreign key to the
-- one named, and every table with a key to THOSE, all the way down, in one
-- statement with no row count to read afterwards and no undo.
--
-- A class list is the top of a chain that very likely ends at paper_scores -
-- the 465 rows holding every mark on every paper. Those are what Data
-- Analytics, Summary Report and the three exams are drawn from. Wiping the
-- student lists could therefore wipe the demo, five days before the defence.
--
-- So: the shape of the graph first, then a script that names each table
-- explicitly instead of trusting CASCADE to stop where you expect.
-- ===========================================================================
\echo ''
\echo '=== 1. every table, and roughly how much is in it =================='
SELECT relname               AS table_name,
       n_live_tup            AS approx_rows
FROM   pg_stat_user_tables
ORDER  BY n_live_tup DESC, relname;

\echo ''
\echo '=== 2. the foreign-key graph, with the DELETE RULE ================='
\echo '    CASCADE   deleting the parent deletes the child'
\echo '    SET NULL  the child survives with a hole where the link was'
\echo '    NO ACTION / RESTRICT  the delete is refused while children exist'
\echo ''
\echo '    Read the `parent` column: anything whose parent is a students or'
\echo '    class-list table is in the blast radius.'
SELECT ccu.table_name  AS parent,
       tc.table_name   AS child,
       kcu.column_name AS child_column,
       rc.delete_rule
FROM   information_schema.table_constraints  tc
JOIN   information_schema.key_column_usage   kcu
       ON  kcu.constraint_name   = tc.constraint_name
       AND kcu.constraint_schema = tc.constraint_schema
JOIN   information_schema.constraint_column_usage ccu
       ON  ccu.constraint_name   = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
JOIN   information_schema.referential_constraints rc
       ON  rc.constraint_name    = tc.constraint_name
       AND rc.constraint_schema  = tc.constraint_schema
WHERE  tc.constraint_type = 'FOREIGN KEY'
  AND  tc.table_schema    = 'public'
ORDER  BY parent, child, child_column;

\echo ''
\echo '=== 3. what is actually on screen in that dropdown ================='
\echo '    Matching the five rows in the Select Option list, so the counts'
\echo '    can be compared against what you can see.'
SELECT c.relname AS table_name
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
  AND  c.relkind = 'r'
  AND  (c.relname ILIKE '%student%' OR c.relname ILIKE '%class%'
        OR c.relname ILIKE '%section%' OR c.relname ILIKE '%list%')
ORDER  BY c.relname;

\echo ''
\echo '=== 4. and the exam side, which is what you would be risking ======='
SELECT 'exams'        AS table_name, count(*) AS rows FROM exams
UNION ALL SELECT 'answer_keys',   count(*) FROM answer_keys
UNION ALL SELECT 'test_papers',   count(*) FROM test_papers
UNION ALL SELECT 'paper_scores',  count(*) FROM paper_scores
ORDER  BY table_name;
\echo ''
