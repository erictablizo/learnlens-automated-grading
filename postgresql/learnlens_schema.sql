--
-- PostgreSQL database dump
--

\restrict NZpmPGtstp67PMUliArgOm0h8xWhNfpaOOhzDvXvja5YcjpmPc8KFPl5UWx8Ozm

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

-- Started on 2026-05-19 17:05:34

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 230 (class 1259 OID 30503)
-- Name: answer_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.answer_keys (
    answer_key_id integer NOT NULL,
    exam_id integer NOT NULL,
    page_id integer NOT NULL,
    question_number smallint NOT NULL,
    correct_answer character varying(10) NOT NULL,
    ocr_confidence numeric(5,2),
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT answer_keys_question_number_check CHECK ((question_number > 0))
);


ALTER TABLE public.answer_keys OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 30502)
-- Name: answer_keys_answer_key_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.answer_keys_answer_key_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.answer_keys_answer_key_id_seq OWNER TO postgres;

--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 229
-- Name: answer_keys_answer_key_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.answer_keys_answer_key_id_seq OWNED BY public.answer_keys.answer_key_id;


--
-- TOC entry 228 (class 1259 OID 30480)
-- Name: exam_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.exam_pages (
    page_id integer NOT NULL,
    exam_id integer NOT NULL,
    page_number smallint NOT NULL,
    image_path character varying(500) NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exam_pages_page_number_check CHECK ((page_number > 0))
);


ALTER TABLE public.exam_pages OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 30479)
-- Name: exam_pages_page_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.exam_pages_page_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.exam_pages_page_id_seq OWNER TO postgres;

--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 227
-- Name: exam_pages_page_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.exam_pages_page_id_seq OWNED BY public.exam_pages.page_id;


--
-- TOC entry 226 (class 1259 OID 30457)
-- Name: exams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.exams (
    exam_id integer NOT NULL,
    created_by integer NOT NULL,
    exam_name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT exams_exam_name_check CHECK ((char_length((exam_name)::text) >= 7))
);


ALTER TABLE public.exams OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 30456)
-- Name: exams_exam_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.exams_exam_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.exams_exam_id_seq OWNER TO postgres;

--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 225
-- Name: exams_exam_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.exams_exam_id_seq OWNED BY public.exams.exam_id;


--
-- TOC entry 234 (class 1259 OID 30550)
-- Name: paper_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.paper_pages (
    paper_page_id integer NOT NULL,
    paper_id integer NOT NULL,
    page_number smallint NOT NULL,
    image_path character varying(500) NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paper_pages_page_number_check CHECK ((page_number > 0))
);


ALTER TABLE public.paper_pages OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 30549)
-- Name: paper_pages_paper_page_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.paper_pages_paper_page_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.paper_pages_paper_page_id_seq OWNER TO postgres;

--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 233
-- Name: paper_pages_paper_page_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.paper_pages_paper_page_id_seq OWNED BY public.paper_pages.paper_page_id;


--
-- TOC entry 236 (class 1259 OID 30573)
-- Name: paper_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.paper_scores (
    score_id integer NOT NULL,
    paper_id integer NOT NULL,
    paper_page_id integer NOT NULL,
    answer_key_id integer NOT NULL,
    question_number smallint NOT NULL,
    student_answer character varying(10) NOT NULL,
    correct_answer character varying(10) NOT NULL,
    is_correct boolean NOT NULL,
    ocr_confidence numeric(5,2),
    graded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paper_scores_question_number_check CHECK ((question_number > 0))
);


ALTER TABLE public.paper_scores OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 30572)
-- Name: paper_scores_score_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.paper_scores_score_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.paper_scores_score_id_seq OWNER TO postgres;

--
-- TOC entry 5146 (class 0 OID 0)
-- Dependencies: 235
-- Name: paper_scores_score_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.paper_scores_score_id_seq OWNED BY public.paper_scores.score_id;


--
-- TOC entry 224 (class 1259 OID 30435)
-- Name: password_resets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_resets (
    reset_id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_resets OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 30434)
-- Name: password_resets_reset_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_resets_reset_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.password_resets_reset_id_seq OWNER TO postgres;

--
-- TOC entry 5147 (class 0 OID 0)
-- Dependencies: 223
-- Name: password_resets_reset_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_resets_reset_id_seq OWNED BY public.password_resets.reset_id;


--
-- TOC entry 232 (class 1259 OID 30530)
-- Name: test_papers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.test_papers (
    paper_id integer NOT NULL,
    exam_id integer NOT NULL,
    student_name character varying(255) NOT NULL,
    total_score smallint,
    checked boolean DEFAULT false NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.test_papers OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 30529)
-- Name: test_papers_paper_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.test_papers_paper_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.test_papers_paper_id_seq OWNER TO postgres;

--
-- TOC entry 5148 (class 0 OID 0)
-- Dependencies: 231
-- Name: test_papers_paper_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.test_papers_paper_id_seq OWNED BY public.test_papers.paper_id;


--
-- TOC entry 222 (class 1259 OID 30410)
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_profiles (
    profile_id integer NOT NULL,
    user_id integer NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    college character varying(20),
    department character varying(255),
    "position" character varying(255),
    avatar_path character varying(500),
    profile_complete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    course character varying(255),
    CONSTRAINT user_profiles_college_check CHECK (((college)::text = ANY ((ARRAY['CVMAS'::character varying, 'CBMA'::character varying, 'CoEd'::character varying, 'CAST'::character varying])::text[])))
);


ALTER TABLE public.user_profiles OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 30409)
-- Name: user_profiles_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_profiles_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_profiles_profile_id_seq OWNER TO postgres;

--
-- TOC entry 5149 (class 0 OID 0)
-- Dependencies: 221
-- Name: user_profiles_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_profiles_profile_id_seq OWNED BY public.user_profiles.profile_id;


--
-- TOC entry 220 (class 1259 OID 30393)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 30392)
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_user_id_seq OWNER TO postgres;

--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- TOC entry 4912 (class 2604 OID 30506)
-- Name: answer_keys answer_key_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys ALTER COLUMN answer_key_id SET DEFAULT nextval('public.answer_keys_answer_key_id_seq'::regclass);


--
-- TOC entry 4910 (class 2604 OID 30483)
-- Name: exam_pages page_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages ALTER COLUMN page_id SET DEFAULT nextval('public.exam_pages_page_id_seq'::regclass);


--
-- TOC entry 4906 (class 2604 OID 30460)
-- Name: exams exam_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exams ALTER COLUMN exam_id SET DEFAULT nextval('public.exams_exam_id_seq'::regclass);


--
-- TOC entry 4918 (class 2604 OID 30553)
-- Name: paper_pages paper_page_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages ALTER COLUMN paper_page_id SET DEFAULT nextval('public.paper_pages_paper_page_id_seq'::regclass);


--
-- TOC entry 4920 (class 2604 OID 30576)
-- Name: paper_scores score_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores ALTER COLUMN score_id SET DEFAULT nextval('public.paper_scores_score_id_seq'::regclass);


--
-- TOC entry 4903 (class 2604 OID 30438)
-- Name: password_resets reset_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets ALTER COLUMN reset_id SET DEFAULT nextval('public.password_resets_reset_id_seq'::regclass);


--
-- TOC entry 4914 (class 2604 OID 30533)
-- Name: test_papers paper_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_papers ALTER COLUMN paper_id SET DEFAULT nextval('public.test_papers_paper_id_seq'::regclass);


--
-- TOC entry 4899 (class 2604 OID 30413)
-- Name: user_profiles profile_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles ALTER COLUMN profile_id SET DEFAULT nextval('public.user_profiles_profile_id_seq'::regclass);


--
-- TOC entry 4896 (class 2604 OID 30396)
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- TOC entry 5129 (class 0 OID 30503)
-- Dependencies: 230
-- Data for Name: answer_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.answer_keys (answer_key_id, exam_id, page_id, question_number, correct_answer, ocr_confidence, generated_at) FROM stdin;
\.


--
-- TOC entry 5127 (class 0 OID 30480)
-- Dependencies: 228
-- Data for Name: exam_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.exam_pages (page_id, exam_id, page_number, image_path, uploaded_at) FROM stdin;
1	1	1	uploads\\exam_pages\\1\\page_1_page_1_Test_Answer_Key.jpg	2026-05-17 14:59:14.269338+08
\.


--
-- TOC entry 5125 (class 0 OID 30457)
-- Dependencies: 226
-- Data for Name: exams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.exams (exam_id, created_by, exam_name, description, created_at, updated_at) FROM stdin;
1	1	Midterm	Midterm for BSCS1A	2026-05-17 14:59:14.227189+08	2026-05-17 14:59:14.227189+08
\.


--
-- TOC entry 5133 (class 0 OID 30550)
-- Dependencies: 234
-- Data for Name: paper_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.paper_pages (paper_page_id, paper_id, page_number, image_path, uploaded_at) FROM stdin;
\.


--
-- TOC entry 5135 (class 0 OID 30573)
-- Dependencies: 236
-- Data for Name: paper_scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.paper_scores (score_id, paper_id, paper_page_id, answer_key_id, question_number, student_answer, correct_answer, is_correct, ocr_confidence, graded_at) FROM stdin;
\.


--
-- TOC entry 5123 (class 0 OID 30435)
-- Dependencies: 224
-- Data for Name: password_resets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_resets (reset_id, user_id, token, expires_at, used, created_at) FROM stdin;
\.


--
-- TOC entry 5131 (class 0 OID 30530)
-- Dependencies: 232
-- Data for Name: test_papers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.test_papers (paper_id, exam_id, student_name, total_score, checked, added_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5121 (class 0 OID 30410)
-- Dependencies: 222
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_profiles (profile_id, user_id, first_name, last_name, college, department, "position", avatar_path, profile_complete, created_at, updated_at, course) FROM stdin;
1	1	Eric Bernard R.	Tablizo	CAST	Computer Science	Teacher	\N	t	2026-05-17 14:53:53.143262+08	2026-05-17 14:53:53.197473+08	\N
2	2	Eric	Tablizo	CAST	Computer Science	Teacher	uploads\\avatars\\user_2.jpg	t	2026-05-17 20:22:42.586857+08	2026-05-17 20:22:42.661484+08	\N
\.


--
-- TOC entry 5119 (class 0 OID 30393)
-- Dependencies: 220
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, email, password_hash, created_at, updated_at) FROM stdin;
1	eric.tablizo@dlsau.edu.ph	$2b$12$auyn3je0PueNvIPywg0lBO6W/GM1DInNvfj6sNlHjIUTQfEuH6mJm	2026-05-17 14:51:53.083329+08	2026-05-17 14:51:53.083329+08
2	42.ericbernardrodulfotablizo@gmail.com	$2b$12$1N2SjT3LRb6p2glGC1HhxuEgKuI62TZxndbaNtgQ69RGppR6d8A0i	2026-05-17 20:21:54.24625+08	2026-05-17 20:21:54.24625+08
\.


--
-- TOC entry 5151 (class 0 OID 0)
-- Dependencies: 229
-- Name: answer_keys_answer_key_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.answer_keys_answer_key_id_seq', 1, false);


--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 227
-- Name: exam_pages_page_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.exam_pages_page_id_seq', 1, true);


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 225
-- Name: exams_exam_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.exams_exam_id_seq', 1, true);


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 233
-- Name: paper_pages_paper_page_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.paper_pages_paper_page_id_seq', 1, false);


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 235
-- Name: paper_scores_score_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.paper_scores_score_id_seq', 1, false);


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 223
-- Name: password_resets_reset_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.password_resets_reset_id_seq', 1, false);


--
-- TOC entry 5157 (class 0 OID 0)
-- Dependencies: 231
-- Name: test_papers_paper_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.test_papers_paper_id_seq', 1, false);


--
-- TOC entry 5158 (class 0 OID 0)
-- Dependencies: 221
-- Name: user_profiles_profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_profiles_profile_id_seq', 2, true);


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_user_id_seq', 2, true);


--
-- TOC entry 4947 (class 2606 OID 30518)
-- Name: answer_keys answer_keys_exam_id_question_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_exam_id_question_number_key UNIQUE (exam_id, question_number);


--
-- TOC entry 4949 (class 2606 OID 30516)
-- Name: answer_keys answer_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_pkey PRIMARY KEY (answer_key_id);


--
-- TOC entry 4943 (class 2606 OID 30496)
-- Name: exam_pages exam_pages_exam_id_page_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages
    ADD CONSTRAINT exam_pages_exam_id_page_number_key UNIQUE (exam_id, page_number);


--
-- TOC entry 4945 (class 2606 OID 30494)
-- Name: exam_pages exam_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages
    ADD CONSTRAINT exam_pages_pkey PRIMARY KEY (page_id);


--
-- TOC entry 4941 (class 2606 OID 30473)
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (exam_id);


--
-- TOC entry 4953 (class 2606 OID 30566)
-- Name: paper_pages paper_pages_paper_id_page_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages
    ADD CONSTRAINT paper_pages_paper_id_page_number_key UNIQUE (paper_id, page_number);


--
-- TOC entry 4955 (class 2606 OID 30564)
-- Name: paper_pages paper_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages
    ADD CONSTRAINT paper_pages_pkey PRIMARY KEY (paper_page_id);


--
-- TOC entry 4957 (class 2606 OID 30591)
-- Name: paper_scores paper_scores_paper_id_answer_key_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_paper_id_answer_key_id_key UNIQUE (paper_id, answer_key_id);


--
-- TOC entry 4959 (class 2606 OID 30589)
-- Name: paper_scores paper_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_pkey PRIMARY KEY (score_id);


--
-- TOC entry 4937 (class 2606 OID 30448)
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (reset_id);


--
-- TOC entry 4939 (class 2606 OID 30450)
-- Name: password_resets password_resets_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_token_key UNIQUE (token);


--
-- TOC entry 4951 (class 2606 OID 30543)
-- Name: test_papers test_papers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_papers
    ADD CONSTRAINT test_papers_pkey PRIMARY KEY (paper_id);


--
-- TOC entry 4933 (class 2606 OID 30426)
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (profile_id);


--
-- TOC entry 4935 (class 2606 OID 30428)
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- TOC entry 4929 (class 2606 OID 30408)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4931 (class 2606 OID 30406)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4964 (class 2606 OID 30519)
-- Name: answer_keys answer_keys_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;


--
-- TOC entry 4965 (class 2606 OID 30524)
-- Name: answer_keys answer_keys_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.exam_pages(page_id) ON DELETE CASCADE;


--
-- TOC entry 4963 (class 2606 OID 30497)
-- Name: exam_pages exam_pages_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages
    ADD CONSTRAINT exam_pages_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;


--
-- TOC entry 4962 (class 2606 OID 30474)
-- Name: exams exams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 4967 (class 2606 OID 30567)
-- Name: paper_pages paper_pages_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages
    ADD CONSTRAINT paper_pages_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES public.test_papers(paper_id) ON DELETE CASCADE;


--
-- TOC entry 4968 (class 2606 OID 30602)
-- Name: paper_scores paper_scores_answer_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_answer_key_id_fkey FOREIGN KEY (answer_key_id) REFERENCES public.answer_keys(answer_key_id) ON DELETE CASCADE;


--
-- TOC entry 4969 (class 2606 OID 30592)
-- Name: paper_scores paper_scores_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES public.test_papers(paper_id) ON DELETE CASCADE;


--
-- TOC entry 4970 (class 2606 OID 30597)
-- Name: paper_scores paper_scores_paper_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_paper_page_id_fkey FOREIGN KEY (paper_page_id) REFERENCES public.paper_pages(paper_page_id) ON DELETE CASCADE;


--
-- TOC entry 4961 (class 2606 OID 30451)
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 4966 (class 2606 OID 30544)
-- Name: test_papers test_papers_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_papers
    ADD CONSTRAINT test_papers_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;


--
-- TOC entry 4960 (class 2606 OID 30429)
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


-- Completed on 2026-05-19 17:05:34

--
-- PostgreSQL database dump complete
--

\unrestrict NZpmPGtstp67PMUliArgOm0h8xWhNfpaOOhzDvXvja5YcjpmPc8KFPl5UWx8Ozm

