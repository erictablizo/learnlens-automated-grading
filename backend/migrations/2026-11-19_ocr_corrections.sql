-- LearnLens — migration 2026-11-19
-- =================================
-- public.ocr_corrections — the administrator-maintained specimen table.
--
--     Sir Alex Passion, 19 November 2026, points 4, 5, 6 and 7:
--       "corrections / handling conditions to cover Machine"
--       "teach the algorithm to recognize E not as a dash"
--       "Technical Admin — alphabet recognition handling; sample specimen to
--        include E; add specimen recognition"
--       "letter B"
--
-- One row says: THE READER SAW `seen`, IT MEANS `means`.
--
-- Run with the backend STOPPED:
--   psql -U postgres -d learnlens_automated_grading -f migrations/2026-11-19_ocr_corrections.sql
--
-- Safe to run twice: every statement is guarded.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ocr_corrections (
    correction_id integer                  NOT NULL,
    seen          character varying(100)   NOT NULL,
    means         character varying(100)   NOT NULL,
    note          character varying(200),
    created_by    integer,
    created_at    timestamp with time zone DEFAULT now() NOT NULL,
    updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.ocr_corrections_correction_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.ocr_corrections_correction_id_seq
    OWNED BY public.ocr_corrections.correction_id;
ALTER TABLE ONLY public.ocr_corrections
    ALTER COLUMN correction_id SET DEFAULT nextval('public.ocr_corrections_correction_id_seq'::regclass);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_corrections_pkey') THEN
        ALTER TABLE ONLY public.ocr_corrections
            ADD CONSTRAINT ocr_corrections_pkey PRIMARY KEY (correction_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_corrections_created_by_fkey') THEN
        ALTER TABLE ONLY public.ocr_corrections
            ADD CONSTRAINT ocr_corrections_created_by_fkey FOREIGN KEY (created_by)
            REFERENCES public.users(user_id) ON DELETE SET NULL;
    END IF;

    -- Each guard below is a way of inventing marks, refused in the DATABASE so
    -- that no future caller can get round it. The service refuses them too; a
    -- rule this dangerous is worth stating twice.

    -- 1. Neither side may be blank. Mapping "" to anything would put an answer
    --    on every item every student left empty, across a whole class, in one
    --    click.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ocr_corrections_nonblank') THEN
        ALTER TABLE ONLY public.ocr_corrections
            ADD CONSTRAINT ck_ocr_corrections_nonblank
            CHECK (btrim(seen) <> '' AND btrim(means) <> '');
    END IF;

    -- 2. Neither side may be the BLANK glyph the grader writes for an
    --    unanswered item (grader.BLANK = U+2014 EM DASH). An ordinary hyphen
    --    "-" is a real reading and IS allowed - that is Alex's point 5.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ocr_corrections_not_blank_glyph') THEN
        ALTER TABLE ONLY public.ocr_corrections
            ADD CONSTRAINT ck_ocr_corrections_not_blank_glyph
            CHECK (btrim(seen) <> U&'\2014' AND btrim(means) <> U&'\2014');
    END IF;

    -- 3. Neither side may contain the contested separator. "A|B" is not a
    --    reading of one mark, and a rule written for a letter has nothing to
    --    say about two. (ocr_item_numbers.CONTESTED_SEP = '|')
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ocr_corrections_not_contested') THEN
        ALTER TABLE ONLY public.ocr_corrections
            ADD CONSTRAINT ck_ocr_corrections_not_contested
            CHECK (position('|' in seen) = 0 AND position('|' in means) = 0);
    END IF;

    -- 4. A row that corrects a reading to itself is a no-op that would appear
    --    in the admin list as if it did something.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ocr_corrections_not_noop') THEN
        ALTER TABLE ONLY public.ocr_corrections
            ADD CONSTRAINT ck_ocr_corrections_not_noop
            CHECK (upper(btrim(seen)) <> upper(btrim(means)));
    END IF;
END $$;

-- The lookup key, and the uniqueness rule. Matching service.norm_seen()
-- exactly: strip, upper. Two administrators cannot teach the system two
-- different meanings for the same reading.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ocr_corrections_seen
    ON public.ocr_corrections (upper(btrim(seen)));

-- The cascade's index. `rescore_for()` selects on exactly this expression;
-- without it, every correction saved is a sequential scan of paper_scores.
CREATE INDEX IF NOT EXISTS ix_paper_scores_student_answer
    ON public.paper_scores (upper(btrim(student_answer)));

COMMIT;

-- ---------------------------------------------------------------------------
-- WHY seen AND means ARE VARCHAR(100)
--
-- paper_scores.student_answer and .correct_answer were widened from
-- VARCHAR(10) to VARCHAR(100) by migrations/2026-11-02_parts_and_answer_length.sql,
-- so that an identification answer like 'THESIS STATEMENT' (16 characters)
-- could be stored. The correction table matches that width exactly: a
-- correction must be writable into the column it will be written into.
--
-- CHECKED 2026-11-19 against the live tree: ocr_service.grade_paper slices
-- [:MAX_ANSWER_LEN], and MAX_ANSWER_LEN is 100 (app/ml/ocr_identification.py).
-- So a correction up to 100 characters round-trips intact. An earlier draft of
-- this file claimed grade_paper still sliced [:10]; that is true of the
-- project copy of ocr_service.py and false of what is deployed. The claim was
-- withdrawn - see SPECIMEN-CORRECTIONS-2026-11-19.md.
--
-- WHAT THIS MIGRATION DOES NOT DO, ON PURPOSE
--
--   * It inserts NO rows. An empty table is exactly today's behaviour: the
--     correction pass is a no-op over an empty map. Nothing changes until an
--     administrator deliberately teaches the system something.
--
--   * It does not touch paper_scores' columns, answer_keys, or any existing
--     constraint. The only edit to an existing table is one added INDEX.
--
-- Rollback:
--   BEGIN;
--   DROP INDEX IF EXISTS public.ix_paper_scores_student_answer;
--   DROP TABLE IF EXISTS public.ocr_corrections;
--   DROP SEQUENCE IF EXISTS public.ocr_corrections_correction_id_seq;
--   COMMIT;
-- ---------------------------------------------------------------------------