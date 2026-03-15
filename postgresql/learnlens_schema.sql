--
-- PostgreSQL database dump
--

\restrict 9JXj9WdxYFQx1FyYPgfsoc3mymiqCAaVyVBeaAfM5WDVc7dNPJLhTmL77bgNAC6

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

-- Started on 2026-03-14 23:51:23

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 29827)
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
-- TOC entry 227 (class 1259 OID 29826)
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
-- TOC entry 5135 (class 0 OID 0)
-- Dependencies: 227
-- Name: answer_keys_answer_key_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.answer_keys_answer_key_id_seq OWNED BY public.answer_keys.answer_key_id;


--
-- TOC entry 226 (class 1259 OID 29803)
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
-- TOC entry 225 (class 1259 OID 29802)
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
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 225
-- Name: exam_pages_page_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.exam_pages_page_id_seq OWNED BY public.exam_pages.page_id;


--
-- TOC entry 224 (class 1259 OID 29780)
-- Name: exams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.exams (
    exam_id integer NOT NULL,
    created_by integer NOT NULL,
    exam_name character varying(255) NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT exams_exam_name_check CHECK ((char_length((exam_name)::text) >= 7))
);


ALTER TABLE public.exams OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 29779)
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
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 223
-- Name: exams_exam_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.exams_exam_id_seq OWNED BY public.exams.exam_id;


--
-- TOC entry 232 (class 1259 OID 29878)
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
-- TOC entry 231 (class 1259 OID 29877)
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
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 231
-- Name: paper_pages_paper_page_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.paper_pages_paper_page_id_seq OWNED BY public.paper_pages.paper_page_id;


--
-- TOC entry 234 (class 1259 OID 29902)
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
-- TOC entry 233 (class 1259 OID 29901)
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
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 233
-- Name: paper_scores_score_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.paper_scores_score_id_seq OWNED BY public.paper_scores.score_id;


--
-- TOC entry 222 (class 1259 OID 29757)
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
-- TOC entry 221 (class 1259 OID 29756)
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
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 221
-- Name: password_resets_reset_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_resets_reset_id_seq OWNED BY public.password_resets.reset_id;


--
-- TOC entry 230 (class 1259 OID 29856)
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
-- TOC entry 229 (class 1259 OID 29855)
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
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 229
-- Name: test_papers_paper_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.test_papers_paper_id_seq OWNED BY public.test_papers.paper_id;


--
-- TOC entry 220 (class 1259 OID 29739)
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
-- TOC entry 219 (class 1259 OID 29738)
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
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- TOC entry 4902 (class 2604 OID 29830)
-- Name: answer_keys answer_key_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys ALTER COLUMN answer_key_id SET DEFAULT nextval('public.answer_keys_answer_key_id_seq'::regclass);


--
-- TOC entry 4900 (class 2604 OID 29806)
-- Name: exam_pages page_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages ALTER COLUMN page_id SET DEFAULT nextval('public.exam_pages_page_id_seq'::regclass);


--
-- TOC entry 4897 (class 2604 OID 29783)
-- Name: exams exam_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exams ALTER COLUMN exam_id SET DEFAULT nextval('public.exams_exam_id_seq'::regclass);


--
-- TOC entry 4908 (class 2604 OID 29881)
-- Name: paper_pages paper_page_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages ALTER COLUMN paper_page_id SET DEFAULT nextval('public.paper_pages_paper_page_id_seq'::regclass);


--
-- TOC entry 4910 (class 2604 OID 29905)
-- Name: paper_scores score_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores ALTER COLUMN score_id SET DEFAULT nextval('public.paper_scores_score_id_seq'::regclass);


--
-- TOC entry 4894 (class 2604 OID 29760)
-- Name: password_resets reset_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets ALTER COLUMN reset_id SET DEFAULT nextval('public.password_resets_reset_id_seq'::regclass);


--
-- TOC entry 4904 (class 2604 OID 29859)
-- Name: test_papers paper_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_papers ALTER COLUMN paper_id SET DEFAULT nextval('public.test_papers_paper_id_seq'::regclass);


--
-- TOC entry 4891 (class 2604 OID 29742)
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- TOC entry 5123 (class 0 OID 29827)
-- Dependencies: 228
-- Data for Name: answer_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.answer_keys (answer_key_id, exam_id, page_id, question_number, correct_answer, ocr_confidence, generated_at) FROM stdin;
\.


--
-- TOC entry 5121 (class 0 OID 29803)
-- Dependencies: 226
-- Data for Name: exam_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.exam_pages (page_id, exam_id, page_number, image_path, uploaded_at) FROM stdin;
\.


--
-- TOC entry 5119 (class 0 OID 29780)
-- Dependencies: 224
-- Data for Name: exams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.exams (exam_id, created_by, exam_name, description, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5127 (class 0 OID 29878)
-- Dependencies: 232
-- Data for Name: paper_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.paper_pages (paper_page_id, paper_id, page_number, image_path, uploaded_at) FROM stdin;
\.


--
-- TOC entry 5129 (class 0 OID 29902)
-- Dependencies: 234
-- Data for Name: paper_scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.paper_scores (score_id, paper_id, paper_page_id, answer_key_id, question_number, student_answer, correct_answer, is_correct, ocr_confidence, graded_at) FROM stdin;
\.


--
-- TOC entry 5117 (class 0 OID 29757)
-- Dependencies: 222
-- Data for Name: password_resets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_resets (reset_id, user_id, token, expires_at, used, created_at) FROM stdin;
\.


--
-- TOC entry 5125 (class 0 OID 29856)
-- Dependencies: 230
-- Data for Name: test_papers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.test_papers (paper_id, exam_id, student_name, total_score, checked, added_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5115 (class 0 OID 29739)
-- Dependencies: 220
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, email, password_hash, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 227
-- Name: answer_keys_answer_key_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.answer_keys_answer_key_id_seq', 1, false);


--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 225
-- Name: exam_pages_page_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.exam_pages_page_id_seq', 1, false);


--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 223
-- Name: exams_exam_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.exams_exam_id_seq', 1, false);


--
-- TOC entry 5146 (class 0 OID 0)
-- Dependencies: 231
-- Name: paper_pages_paper_page_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.paper_pages_paper_page_id_seq', 1, false);


--
-- TOC entry 5147 (class 0 OID 0)
-- Dependencies: 233
-- Name: paper_scores_score_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.paper_scores_score_id_seq', 1, false);


--
-- TOC entry 5148 (class 0 OID 0)
-- Dependencies: 221
-- Name: password_resets_reset_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.password_resets_reset_id_seq', 1, false);


--
-- TOC entry 5149 (class 0 OID 0)
-- Dependencies: 229
-- Name: test_papers_paper_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.test_papers_paper_id_seq', 1, false);


--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_user_id_seq', 1, false);


--
-- TOC entry 4936 (class 2606 OID 29842)
-- Name: answer_keys answer_keys_exam_id_question_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_exam_id_question_number_key UNIQUE (exam_id, question_number);


--
-- TOC entry 4938 (class 2606 OID 29840)
-- Name: answer_keys answer_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_pkey PRIMARY KEY (answer_key_id);


--
-- TOC entry 4931 (class 2606 OID 29819)
-- Name: exam_pages exam_pages_exam_id_page_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages
    ADD CONSTRAINT exam_pages_exam_id_page_number_key UNIQUE (exam_id, page_number);


--
-- TOC entry 4933 (class 2606 OID 29817)
-- Name: exam_pages exam_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages
    ADD CONSTRAINT exam_pages_pkey PRIMARY KEY (page_id);


--
-- TOC entry 4928 (class 2606 OID 29795)
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (exam_id);


--
-- TOC entry 4947 (class 2606 OID 29894)
-- Name: paper_pages paper_pages_paper_id_page_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages
    ADD CONSTRAINT paper_pages_paper_id_page_number_key UNIQUE (paper_id, page_number);


--
-- TOC entry 4949 (class 2606 OID 29892)
-- Name: paper_pages paper_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages
    ADD CONSTRAINT paper_pages_pkey PRIMARY KEY (paper_page_id);


--
-- TOC entry 4954 (class 2606 OID 29920)
-- Name: paper_scores paper_scores_paper_id_answer_key_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_paper_id_answer_key_id_key UNIQUE (paper_id, answer_key_id);


--
-- TOC entry 4956 (class 2606 OID 29918)
-- Name: paper_scores paper_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_pkey PRIMARY KEY (score_id);


--
-- TOC entry 4924 (class 2606 OID 29770)
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (reset_id);


--
-- TOC entry 4926 (class 2606 OID 29772)
-- Name: password_resets password_resets_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_token_key UNIQUE (token);


--
-- TOC entry 4944 (class 2606 OID 29869)
-- Name: test_papers test_papers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_papers
    ADD CONSTRAINT test_papers_pkey PRIMARY KEY (paper_id);


--
-- TOC entry 4919 (class 2606 OID 29754)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4921 (class 2606 OID 29752)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4939 (class 1259 OID 29853)
-- Name: idx_ak_exam_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ak_exam_id ON public.answer_keys USING btree (exam_id);


--
-- TOC entry 4940 (class 1259 OID 29854)
-- Name: idx_ak_page_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ak_page_id ON public.answer_keys USING btree (page_id);


--
-- TOC entry 4934 (class 1259 OID 29825)
-- Name: idx_ep_exam_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ep_exam_id ON public.exam_pages USING btree (exam_id);


--
-- TOC entry 4929 (class 1259 OID 29801)
-- Name: idx_exams_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_exams_created_by ON public.exams USING btree (created_by);


--
-- TOC entry 4945 (class 1259 OID 29900)
-- Name: idx_pp_paper_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pp_paper_id ON public.paper_pages USING btree (paper_id);


--
-- TOC entry 4922 (class 1259 OID 29778)
-- Name: idx_pr_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pr_user_id ON public.password_resets USING btree (user_id);


--
-- TOC entry 4950 (class 1259 OID 29938)
-- Name: idx_ps_ak_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ps_ak_id ON public.paper_scores USING btree (answer_key_id);


--
-- TOC entry 4951 (class 1259 OID 29936)
-- Name: idx_ps_paper_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ps_paper_id ON public.paper_scores USING btree (paper_id);


--
-- TOC entry 4952 (class 1259 OID 29937)
-- Name: idx_ps_paper_page_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ps_paper_page_id ON public.paper_scores USING btree (paper_page_id);


--
-- TOC entry 4941 (class 1259 OID 29876)
-- Name: idx_tp_checked; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tp_checked ON public.test_papers USING btree (checked);


--
-- TOC entry 4942 (class 1259 OID 29875)
-- Name: idx_tp_exam_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tp_exam_id ON public.test_papers USING btree (exam_id);


--
-- TOC entry 4917 (class 1259 OID 29755)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 4960 (class 2606 OID 29843)
-- Name: answer_keys answer_keys_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;


--
-- TOC entry 4961 (class 2606 OID 29848)
-- Name: answer_keys answer_keys_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.exam_pages(page_id) ON DELETE CASCADE;


--
-- TOC entry 4959 (class 2606 OID 29820)
-- Name: exam_pages exam_pages_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exam_pages
    ADD CONSTRAINT exam_pages_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;


--
-- TOC entry 4958 (class 2606 OID 29796)
-- Name: exams exams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 4963 (class 2606 OID 29895)
-- Name: paper_pages paper_pages_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_pages
    ADD CONSTRAINT paper_pages_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES public.test_papers(paper_id) ON DELETE CASCADE;


--
-- TOC entry 4964 (class 2606 OID 29931)
-- Name: paper_scores paper_scores_answer_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_answer_key_id_fkey FOREIGN KEY (answer_key_id) REFERENCES public.answer_keys(answer_key_id) ON DELETE CASCADE;


--
-- TOC entry 4965 (class 2606 OID 29921)
-- Name: paper_scores paper_scores_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES public.test_papers(paper_id) ON DELETE CASCADE;


--
-- TOC entry 4966 (class 2606 OID 29926)
-- Name: paper_scores paper_scores_paper_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paper_scores
    ADD CONSTRAINT paper_scores_paper_page_id_fkey FOREIGN KEY (paper_page_id) REFERENCES public.paper_pages(paper_page_id) ON DELETE CASCADE;


--
-- TOC entry 4957 (class 2606 OID 29773)
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 4962 (class 2606 OID 29870)
-- Name: test_papers test_papers_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_papers
    ADD CONSTRAINT test_papers_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;


-- Completed on 2026-03-14 23:51:23

--
-- PostgreSQL database dump complete
--

\unrestrict 9JXj9WdxYFQx1FyYPgfsoc3mymiqCAaVyVBeaAfM5WDVc7dNPJLhTmL77bgNAC6

