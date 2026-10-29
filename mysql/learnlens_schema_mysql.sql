-- ---------------------------------------------------------------------------
-- LearnLens schema — MySQL / MariaDB edition (for phpMyAdmin import)
--
-- Converted from postgresql/learnlens_schema.sql (pg_dump 18.1, 2026-10-26).
-- Same tables, columns, keys, CHECKs and cascades; only the syntax differs:
--   * SEQUENCE + nextval()      -> AUTO_INCREMENT
--   * timestamp with time zone  -> DATETIME, stored as UTC (the backend sets
--                                  the session time_zone to +00:00)
--   * boolean                   -> TINYINT(1) (what MySQL's BOOLEAN is)
--   * "public." schema prefix   -> removed; phpMyAdmin imports into whichever
--                                  database you have selected
--   * \restrict, SET ..., COPY, OWNER TO, COMMENT ON -> removed (psql-only)
--
-- Import: phpMyAdmin -> select your database in the left panel -> Import ->
-- choose this file -> Go. Do NOT add a CREATE DATABASE; on cPanel hosting the
-- database is created from cPanel -> MySQL Databases.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ── users ──────────────────────────────────────────────────────────────────
CREATE TABLE `users` (
    `user_id`       INT          NOT NULL AUTO_INCREMENT,
    `email`         VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── user_profiles ──────────────────────────────────────────────────────────
CREATE TABLE `user_profiles` (
    `profile_id`       INT          NOT NULL AUTO_INCREMENT,
    `user_id`          INT          NOT NULL,
    `first_name`       VARCHAR(100) NULL,
    `last_name`        VARCHAR(100) NULL,
    `college`          VARCHAR(20)  NULL,
    `department`       VARCHAR(255) NULL,
    `position`         VARCHAR(255) NULL,
    `avatar_path`      VARCHAR(500) NULL,
    `profile_complete` TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `course`           VARCHAR(255) NULL,
    `year_level`       SMALLINT     NULL
        COMMENT 'Year level the teacher usually teaches (1-6). Pre-selects the year on /college.',
    PRIMARY KEY (`profile_id`),
    UNIQUE KEY `user_profiles_user_id_key` (`user_id`),
    CONSTRAINT `user_profiles_college_check`
        CHECK (`college` IN ('CVMAS', 'CBMA', 'CoEd', 'CAST')),
    CONSTRAINT `user_profiles_year_level_check`
        CHECK (`year_level` IS NULL OR (`year_level` >= 1 AND `year_level` <= 6)),
    CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── password_resets ────────────────────────────────────────────────────────
CREATE TABLE `password_resets` (
    `reset_id`   INT          NOT NULL AUTO_INCREMENT,
    `user_id`    INT          NOT NULL,
    `token`      VARCHAR(255) NOT NULL,
    `expires_at` DATETIME     NOT NULL,
    `used`       TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`reset_id`),
    UNIQUE KEY `password_resets_token_key` (`token`),
    CONSTRAINT `password_resets_user_id_fkey` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── exams ──────────────────────────────────────────────────────────────────
-- description has no column DEFAULT: older MySQL rejects defaults on TEXT.
-- The backend always supplies '' itself (Exam.description default="").
CREATE TABLE `exams` (
    `exam_id`     INT          NOT NULL AUTO_INCREMENT,
    `created_by`  INT          NOT NULL,
    `exam_name`   VARCHAR(255) NOT NULL,
    `description` TEXT         NOT NULL,
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`exam_id`),
    CONSTRAINT `exams_exam_name_check` CHECK (CHAR_LENGTH(`exam_name`) >= 7),
    CONSTRAINT `exams_created_by_fkey` FOREIGN KEY (`created_by`)
        REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── exam_pages ─────────────────────────────────────────────────────────────
CREATE TABLE `exam_pages` (
    `page_id`       INT          NOT NULL AUTO_INCREMENT,
    `exam_id`       INT          NOT NULL,
    `page_number`   SMALLINT     NOT NULL,
    `image_path`    VARCHAR(500) NOT NULL,
    `uploaded_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `question_type` VARCHAR(32)  NULL,
    PRIMARY KEY (`page_id`),
    UNIQUE KEY `exam_pages_exam_id_page_number_key` (`exam_id`, `page_number`),
    CONSTRAINT `exam_pages_page_number_check` CHECK (`page_number` > 0),
    CONSTRAINT `exam_pages_exam_id_fkey` FOREIGN KEY (`exam_id`)
        REFERENCES `exams` (`exam_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── exam_page_parts ────────────────────────────────────────────────────────
CREATE TABLE `exam_page_parts` (
    `part_id`       INT         NOT NULL AUTO_INCREMENT,
    `exam_id`       INT         NOT NULL,
    `page_id`       INT         NOT NULL,
    `first_item`    SMALLINT    NOT NULL,
    `last_item`     SMALLINT    NOT NULL,
    `question_type` VARCHAR(32) NOT NULL,
    `letters`       VARCHAR(16) NOT NULL DEFAULT 'ABCD',
    `created_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`part_id`),
    UNIQUE KEY `exam_page_parts_page_id_first_item_key` (`page_id`, `first_item`),
    KEY `ix_exam_page_parts_exam_id` (`exam_id`),
    KEY `ix_exam_page_parts_page_id` (`page_id`),
    CONSTRAINT `exam_page_parts_bounds_check` CHECK (`first_item` >= 1 AND `last_item` <= 500),
    CONSTRAINT `exam_page_parts_range_check`  CHECK (`last_item` >= `first_item`),
    CONSTRAINT `exam_page_parts_exam_id_fkey` FOREIGN KEY (`exam_id`)
        REFERENCES `exams` (`exam_id`) ON DELETE CASCADE,
    CONSTRAINT `exam_page_parts_page_id_fkey` FOREIGN KEY (`page_id`)
        REFERENCES `exam_pages` (`page_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── answer_keys ────────────────────────────────────────────────────────────
CREATE TABLE `answer_keys` (
    `answer_key_id`   INT           NOT NULL AUTO_INCREMENT,
    `exam_id`         INT           NOT NULL,
    `page_id`         INT           NOT NULL,
    `question_number` SMALLINT      NOT NULL,
    `correct_answer`  VARCHAR(100)  NOT NULL DEFAULT '',
    `ocr_confidence`  DECIMAL(5,2)  NULL,
    `generated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`answer_key_id`),
    UNIQUE KEY `answer_keys_exam_id_question_number_key` (`exam_id`, `question_number`),
    CONSTRAINT `answer_keys_question_number_check` CHECK (`question_number` > 0),
    CONSTRAINT `answer_keys_exam_id_fkey` FOREIGN KEY (`exam_id`)
        REFERENCES `exams` (`exam_id`) ON DELETE CASCADE,
    CONSTRAINT `answer_keys_page_id_fkey` FOREIGN KEY (`page_id`)
        REFERENCES `exam_pages` (`page_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── test_papers ────────────────────────────────────────────────────────────
CREATE TABLE `test_papers` (
    `paper_id`     INT          NOT NULL AUTO_INCREMENT,
    `exam_id`      INT          NOT NULL,
    `student_name` VARCHAR(255) NOT NULL,
    `total_score`  SMALLINT     NULL,
    `checked`      TINYINT(1)   NOT NULL DEFAULT 0,
    `added_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`paper_id`),
    CONSTRAINT `test_papers_exam_id_fkey` FOREIGN KEY (`exam_id`)
        REFERENCES `exams` (`exam_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── paper_pages ────────────────────────────────────────────────────────────
CREATE TABLE `paper_pages` (
    `paper_page_id` INT          NOT NULL AUTO_INCREMENT,
    `paper_id`      INT          NOT NULL,
    `page_number`   SMALLINT     NOT NULL,
    `image_path`    VARCHAR(500) NOT NULL,
    `uploaded_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`paper_page_id`),
    UNIQUE KEY `paper_pages_paper_id_page_number_key` (`paper_id`, `page_number`),
    CONSTRAINT `paper_pages_page_number_check` CHECK (`page_number` > 0),
    CONSTRAINT `paper_pages_paper_id_fkey` FOREIGN KEY (`paper_id`)
        REFERENCES `test_papers` (`paper_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── paper_scores ───────────────────────────────────────────────────────────
CREATE TABLE `paper_scores` (
    `score_id`        INT           NOT NULL AUTO_INCREMENT,
    `paper_id`        INT           NOT NULL,
    `paper_page_id`   INT           NOT NULL,
    `answer_key_id`   INT           NOT NULL,
    `question_number` SMALLINT      NOT NULL,
    `student_answer`  VARCHAR(100)  NOT NULL,
    `correct_answer`  VARCHAR(100)  NOT NULL,
    `is_correct`      TINYINT(1)    NOT NULL,
    `ocr_confidence`  DECIMAL(5,2)  NULL,
    `graded_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `verdict`         VARCHAR(10)   NOT NULL DEFAULT 'wrong',
    PRIMARY KEY (`score_id`),
    UNIQUE KEY `paper_scores_paper_id_answer_key_id_key` (`paper_id`, `answer_key_id`),
    CONSTRAINT `paper_scores_question_number_check` CHECK (`question_number` > 0),
    CONSTRAINT `paper_scores_verdict_check` CHECK (`verdict` IN ('correct', 'review', 'wrong')),
    CONSTRAINT `paper_scores_paper_id_fkey` FOREIGN KEY (`paper_id`)
        REFERENCES `test_papers` (`paper_id`) ON DELETE CASCADE,
    CONSTRAINT `paper_scores_paper_page_id_fkey` FOREIGN KEY (`paper_page_id`)
        REFERENCES `paper_pages` (`paper_page_id`) ON DELETE CASCADE,
    CONSTRAINT `paper_scores_answer_key_id_fkey` FOREIGN KEY (`answer_key_id`)
        REFERENCES `answer_keys` (`answer_key_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
