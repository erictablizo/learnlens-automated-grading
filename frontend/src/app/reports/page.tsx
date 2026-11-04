"use client";
/**
 * NEW 2026-11-04 — Summary Report of Exam.
 * Doc Rubrica, consultation, page 2: "New Screen / Summary of Report of Exam".
 *
 * TWO PARTS, and this is the thing to get right. Grace confirmed 2026-11-04:
 * "1st is a Dialog Box, 2nd is the Screen."
 *
 *   BOX 1 — a DIALOG                        BOX 2 — the SCREEN
 *   ┌──────────────────────────┐            ┌──────────────────────────┐
 *   │ [ Subject    v ]         │            │ Summary Report of        │
 *   │ [ Schedule   v ]  1PM    │  Create    │   "Exam Name"            │
 *   │ [ Exam Name  v ]  2PM    │  ───────>  │   Subject   ______       │
 *   │                   3PM    │            │   Schedule  ______       │
 *   │             [ Create ]   │            │   35 Students            │
 *   └──────────────────────────┘            │   ... rows ...           │
 *                                           └──────────────────────────┘
 *
 * The small boxes in her sketch are the dropdown ARROWS - Subject, Schedule
 * and Exam Name are three <select> controls - and "1PM / 2PM / 3PM" beside the
 * Schedule one is example CONTENT of that dropdown, not radio buttons.
 *
 * "Sorted in order = field" / "Alphabetical name = last name" — her page 2.
 *
 * NO NEW BACKEND. Three endpoints that already exist carry all of it:
 *   GET /exams                 -> ExamListResponse[], which has subject and
 *                                 schedule as of 2026-11-04, so both filter
 *                                 dropdowns are distinct values from this list
 *   GET /exams/{id}            -> ExamResponse, for answer_keys.length = the
 *                                 number of items the exam is out of
 *   GET /exams/{id}/papers     -> PaperListResponse[], which has last_name,
 *                                 first_name, total_score and checked
 *
 * Nothing is persisted: the report is generated from live exam and paper data
 * every time, so a re-graded paper is never stale here.
 *
 * HONEST NOTE ON THE INDEX: the 2026-11-04 migration added
 * ix_test_papers_exam_lastname (exam_id, lower(last_name), lower(first_name))
 * for this sort, and this screen does NOT use it - 35 rows are sorted in the
 * browser. The index earns its keep only if a server-side sorted endpoint is
 * added later. It is not wasted, but it is not load-bearing today either.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { examService } from "@/services/examService";
import { paperService } from "@/services/paperService";
import { Exam } from "@/types/exam";
import { Paper } from "@/types/paper";
import { getToken, isAuthenticated } from "@/lib/auth";
import { bySurname, paperLastName, paperFirstName, needsNameSplit } from "@/lib/textField";

const ANY = "";   // the "All" option value on both filter dropdowns

/** Distinct, case-insensitively de-duplicated, alphabetical. */
function distinct(values: (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }));
}

const eq = (a: string | null, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

// ── BOX 1 — the dialog ───────────────────────────────────────────────────────
interface PickerProps {
  exams:    Exam[];
  /** The exam already on screen, so reopening the dialog starts where it left off. */
  current:  number | null;
  onCreate: (examId: number) => void;
  onClose:  () => void;
}

function ExamPickerDialog({ exams, current, onCreate, onClose }: PickerProps) {
  const start = exams.find(e => e.exam_id === current) ?? null;
  const [subject,  setSubject]  = useState(start?.subject  ?? ANY);
  const [schedule, setSchedule] = useState(start?.schedule ?? ANY);
  const [examId,   setExamId]   = useState<number | null>(current);
  const [error,    setError]    = useState<string | null>(null);

  const subjects  = useMemo(() => distinct(exams.map(e => e.subject)),  [exams]);
  const schedules = useMemo(() => distinct(exams.map(e => e.schedule)), [exams]);

  // Exam Name is the THIRD box and it narrows with the two above it, which is
  // what the boxes reading top-to-bottom in her sketch means.
  const visible = useMemo(
    () => exams.filter(e =>
      (subject  === ANY || eq(e.subject,  subject)) &&
      (schedule === ANY || eq(e.schedule, schedule))),
    [exams, subject, schedule],
  );

  // Drop a selection that falls outside the narrowed list, so the <select>
  // never holds a value with no matching option - the trap Create Exam hit on
  // 2026-10-23 with value={12} against options 1..10.
  useEffect(() => {
    if (examId !== null && !visible.some(e => e.exam_id === examId)) setExamId(null);
  }, [visible, examId]);

  const handleCreate = () => {
    if (examId === null) { setError("Choose an exam first."); return; }
    onCreate(examId);
  };

  return (
    <Modal title="Summary Report of Exam" onClose={onClose}>
      {error && (
        <div role="alert" className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>
      )}

      <label className="form-label" htmlFor="pick-subject">Subject</label>
      <select
        id="pick-subject"
        className="dropdown"
        value={subject}
        onChange={e => { setSubject(e.target.value); setError(null); }}
        style={{ width: "100%", marginBottom: "1rem" }}
      >
        <option value={ANY}>All subjects</option>
        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="form-label" htmlFor="pick-schedule">Schedule</label>
      <select
        id="pick-schedule"
        className="dropdown"
        value={schedule}
        onChange={e => { setSchedule(e.target.value); setError(null); }}
        style={{ width: "100%", marginBottom: "1rem" }}
      >
        <option value={ANY}>All schedules</option>
        {schedules.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="form-label" htmlFor="pick-exam">Exam Name</label>
      <select
        id="pick-exam"
        className="dropdown"
        value={examId ?? ""}
        onChange={e => { setExamId(e.target.value === "" ? null : Number(e.target.value)); setError(null); }}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      >
        <option value="">Select an exam…</option>
        {visible.map(e => <option key={e.exam_id} value={e.exam_id}>{e.exam_name}</option>)}
      </select>

      {/* The two filters can narrow to nothing. Say so rather than leaving an
          empty dropdown with no explanation. */}
      {visible.length === 0 && exams.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
          No exam matches that subject and schedule.
        </p>
      )}
      {exams.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
          You have not created any exams yet.
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={examId === null}
          style={{ width: "auto", padding: "0.65rem 1.75rem" }}
        >
          Create
        </Button>
      </div>
    </Modal>
  );
}

// ── BOX 2 — the screen ───────────────────────────────────────────────────────
export default function SummaryReportPage() {
  const router = useRouter();

  const [exams,   setExams]   = useState<Exam[]>([]);
  const [exam,    setExam]    = useState<Exam | null>(null);
  const [papers,  setPapers]  = useState<Paper[]>([]);

  const [loading,       setLoading]       = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Load the exam list once, then open the dialog - the screen behind it has
  // nothing to show until an exam is chosen, which is the order her sketch
  // draws: dialog first, screen second.
  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    const load = async () => {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      setLoading(true);
      try {
        setExams(await examService.list(token));
        setPickerOpen(true);
      } catch {
        setError("Could not load your exams.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const loadReport = useCallback(async (id: number) => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setPickerOpen(false);
    setLoadingReport(true);
    setError(null);
    try {
      const [detail, rows] = await Promise.all([
        examService.get(id, token),
        paperService.list(id, token),
      ]);
      setExam(detail);
      setPapers(rows);
    } catch {
      setError("Could not load this exam's report.");
      setExam(null);
      setPapers([]);
    } finally {
      setLoadingReport(false);
    }
  }, [router]);

  // "Sorted in order … Alphabetical, last name" — her page 2.
  const sorted = useMemo(() => papers.slice().sort(bySurname), [papers]);

  // The exam is out of this many items. answer_keys spans every page, so the
  // length is the whole paper's item count, not one page's.
  const totalItems = exam?.answer_keys?.length ?? 0;
  const unsplitCount = sorted.filter(needsNameSplit).length;

  if (loading) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="spinner spinner-dark" />
          <span style={{ color: "var(--text-muted)" }}>Loading exams…</span>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Summary Report of Exam</h1>
          <Button
            variant="secondary"
            onClick={() => setPickerOpen(true)}
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}
          >
            {exam ? "Change exam" : "Choose exam"}
          </Button>
        </div>

        {error && (
          <div role="alert" className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>
        )}

        {loadingReport && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 0" }}>
            <span className="spinner spinner-dark" />
            <span style={{ color: "var(--text-muted)" }}>Loading report…</span>
          </div>
        )}

        {!exam && !loadingReport && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Choose a subject, a schedule and an exam to create its summary report.
          </p>
        )}

        {exam && !loadingReport && (
          <div style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            padding: "1.5rem", background: "var(--surface)",
          }}>
            <h2 style={{
              fontFamily: "var(--font-heading)", fontSize: "1.15rem", fontWeight: 700,
              color: "var(--navy)", marginBottom: "0.75rem",
            }}>
              Summary Report of “{exam.exam_name}”
            </h2>

            <div style={{
              display: "flex", flexWrap: "wrap", gap: "0.35rem 2rem",
              marginBottom: "1rem", fontSize: "0.85rem",
            }}>
              <span>
                <span style={{ color: "var(--text-muted)" }}>Subject: </span>
                <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.subject ?? "—"}</span>
              </span>
              <span>
                <span style={{ color: "var(--text-muted)" }}>Schedule: </span>
                <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.schedule ?? "—"}</span>
              </span>
              <span>
                <span style={{ color: "var(--text-muted)" }}>Students: </span>
                <span style={{ color: "var(--navy)", fontWeight: 600 }}>{sorted.length}</span>
              </span>
              {totalItems > 0 && (
                <span>
                  <span style={{ color: "var(--text-muted)" }}>Items: </span>
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>{totalItems}</span>
                </span>
              )}
            </div>

            {/* The split is why the sort can be trusted. If rows are still
                unsplit, the alphabetical order is only as good as the guess
                paperLastName() makes from student_name. Say so here rather
                than letting the report look authoritative when it is not. */}
            {unsplitCount > 0 && (
              <div role="status" style={{
                marginBottom: "1rem", padding: "0.6rem 0.8rem", fontSize: "0.8rem",
                lineHeight: 1.5, color: "var(--navy)", background: "var(--orange-light)",
                border: "1px solid var(--orange)", borderRadius: "var(--radius-sm)",
              }}>
                {unsplitCount} of {sorted.length} name(s) have not been split into
                Last Name and First Name yet, so this list is ordered by a best
                guess for those rows. Open each one in Edit Paper to split it.
              </div>
            )}

            <div className="table-wrapper">
              <table aria-label={`Summary report for ${exam.exam_name}`}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th style={{ width: 110 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                        No test papers have been added to this exam yet.
                      </td>
                    </tr>
                  ) : sorted.map((p, idx) => (
                    <tr key={p.paper_id}>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{idx + 1}</td>
                      <td style={{ color: "var(--navy)", fontWeight: 500 }}>{paperLastName(p) || "—"}</td>
                      <td style={{ color: "var(--navy)", fontWeight: 500 }}>{paperFirstName(p) || "—"}</td>
                      <td>
                        {/* total_score is NULL until the paper is graded. It is
                            set but `checked` stays FALSE while identification
                            items are still under review - that score is a FLOOR,
                            not a result, which is the distinction the Add Paper
                            dialog now draws too. Printing a bare number for such
                            a paper is the "11 of 19" bug in report form. */}
                        {p.total_score === null || p.total_score === undefined ? (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Not checked</span>
                        ) : p.checked ? (
                          <span style={{ fontWeight: 700, color: "var(--navy)" }}>
                            {p.total_score}{totalItems > 0 && ` / ${totalItems}`}
                          </span>
                        ) : (
                          <span style={{ fontWeight: 700, color: "var(--orange)" }}
                                title="Some items are still waiting for your decision, so this score is a minimum.">
                            {p.total_score}{totalItems > 0 && ` / ${totalItems}`}
                            <span style={{ fontWeight: 500, fontSize: "0.72rem", display: "block" }}>
                              pending review
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          <Button variant="secondary" onClick={() => router.push("/exams")}>← Back to Manage Exams</Button>
        </div>

        {pickerOpen && (
          <ExamPickerDialog
            exams={exams}
            current={exam?.exam_id ?? null}
            onCreate={loadReport}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </main>
    </div>
  );
}