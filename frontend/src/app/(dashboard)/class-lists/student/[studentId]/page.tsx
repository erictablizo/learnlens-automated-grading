"use client";
/**
 * app/(dashboard)/class-lists/student/[studentId]/page.tsx
 * =======================================================
 * NEW 2026-11-17 — Recommendations page 11.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import { studentService } from "@/services/studentService";
import type { StudentExamRecord, StudentExamScore } from "@/types/student";
import { getToken, isAuthenticated } from "@/lib/auth";
// NEW 2026-11-22 — Alex, Recommendations page 15.
import { readParam, backToListHref, FROM_PARAM } from "@/lib/classListReturn";
// NEW 2026-11-23 - Ms. Melanie, Recommendations page 18, requirement 6.
import {
  DEFAULT_PASSING_MARK, clampMark, outOf, passingScore, pct, pctLabel,
} from "@/lib/passing";

function scoreOf(r: StudentExamScore): { text: string; muted: boolean; note: string | null } {
  if (r.checked && r.total_score !== null) {
    return { text: `${r.total_score} / ${r.total_points || r.total_items}`, muted: false, note: null };
  }
  if (r.total_score !== null) {
    return {
      text: `${r.total_score}–${r.total_score + r.under_review} / ${r.total_points || r.total_items}`,
      muted: false,
      note: `${r.under_review} item(s) waiting for your decision`,
    };
  }
  return { text: "Not checked yet", muted: true, note: null };
}

export default function StudentRecordPage() {
  const router = useRouter();
  const params = useParams();
  const raw = params.studentId;
  const studentId = Number(Array.isArray(raw) ? raw[0] : raw);

  /* NEW 2026-11-22 — Alex, Recommendations page 15: which list this record
   * was opened from, so "Back to List of Students" returns to the roster
   * rather than to the empty picker.
   *
   * Read in an effect from window.location.search rather than with
   * useSearchParams(), which in the App Router forces this page into a
   * Suspense boundary at prerender and fails the build without one. null
   * when the record was opened from a bookmark or a typed URL — the button
   * then goes to /class-lists plain, which is the only honest answer there. */
  const [from, setFrom] = useState<number | null>(null);
  useEffect(() => { setFrom(readParam(window.location.search, FROM_PARAM)); }, []);

  /* NEW 2026-11-23 - Ms. Melanie, page 18 requirement 6. No passing mark is
   * stored anywhere, so the teacher types one, exactly as she already does on
   * Data Analytics. It is per visit and deliberately not persisted: persisting
   * it would make one teacher's 50% silently change what another teacher sees
   * as "Passing Score" on the same student. See lib/passing.ts. */
  const [mark, setMark] = useState<number>(DEFAULT_PASSING_MARK);

  const [record, setRecord] = useState<StudentExamRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true); setError(null);
    try {
      setRecord(await studentService.exams(studentId, token));
    } catch {
      setError("Could not load this student's record.");
    } finally { setLoading(false); }
  }, [studentId, router]);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    if (!Number.isFinite(studentId)) {
      setError("That is not a student id."); setLoading(false); return;
    }
    void load();
  }, [load, router, studentId]);

  const s = record?.student ?? null;
  const exams = record?.exams ?? [];

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>Student Record</h1>

        {error && (
          <div role="alert" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 0" }}>
            <span className="spinner spinner-dark" />
            <span style={{ color: "var(--text-muted)" }}>Loading…</span>
          </div>
        )}

        {!loading && s && (
          <>
            <div style={{ marginBottom: "1.5rem", fontSize: "0.9rem", lineHeight: 1.9 }}>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Student Name: </span>
                <span style={{ color: "var(--navy)", fontWeight: 600 }}>
                  {s.last_name}, {s.first_name}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Student ID: </span>
                <span style={{ color: "var(--navy)", fontWeight: 600 }}>{s.student_number}</span>
              </div>
            </div>

            {/* NEW 2026-11-23 - Melanie req 6 item 2. Wording matches the
                Data Analytics box so the two screens read the same. */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                          marginBottom: "0.6rem", fontSize: "0.85rem" }}>
              <label htmlFor="passing-mark" style={{ color: "var(--text-muted)" }}>
                Passing mark
              </label>
              <input
                id="passing-mark"
                type="number"
                min={1}
                max={100}
                value={mark}
                onChange={e => setMark(clampMark(Number(e.target.value)))}
                className="form-input"
                style={{ width: 74, padding: "0.3rem 0.5rem", textAlign: "center" }}
              />
              <span style={{ color: "var(--text-muted)" }}>%</span>
            </div>

            <div className="table-wrapper">
              <table aria-label="Exams and scores for this student">
                <thead>
                  <tr>
                    <th>Exam Name</th>
                    <th style={{ width: 160 }}>Subject</th>
                    <th style={{ width: 170 }}>Score</th>
                    <th style={{ width: 110 }}>%</th>
                    <th style={{ width: 130 }}>
                      Passing Score
                      <div style={{ fontSize: "0.68rem", fontWeight: 400,
                                    color: "var(--text-muted)" }}>
                        at {mark}%
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exams.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        No paper for this student on any of your exams yet.
                      </td>
                    </tr>
                  ) : exams.map(r => {
                    const c = scoreOf(r);
                    /* NEW 2026-11-23 - Melanie req 6 items 2 and 3.
                     * `hi` is the top of the range an unchecked paper could
                     * still reach, so the percentage shows a range wherever
                     * the score does - a single percentage next to "12-15 / 65"
                     * would be a number the teacher cannot place. */
                    const out = outOf(r);
                    const lo = r.total_score;
                    const hi = lo === null ? null : lo + (r.checked ? 0 : r.under_review);
                    const need = passingScore(out, mark);
                    return (
                      <tr key={r.paper_id}>
                        <td style={{ fontWeight: 600, color: "var(--navy)" }}>{r.exam_name}</td>
                        <td style={{ color: "var(--text-muted)" }}>{r.subject ?? "—"}</td>
                        <td style={{ color: c.muted ? "var(--text-muted)" : "var(--navy)", fontWeight: c.muted ? 400 : 600 }}>
                          {c.text}
                          {c.note && (
                            <div style={{ fontSize: "0.72rem", color: "var(--orange)", fontWeight: 400 }}>
                              {c.note}
                            </div>
                          )}
                        </td>
                        <td style={{ color: lo === null || out <= 0 ? "var(--text-muted)" : "var(--navy)",
                                     fontWeight: lo === null || out <= 0 ? 400 : 600 }}>
                          {lo === null || out <= 0
                            ? "\u2014"
                            : hi !== null && hi !== lo
                              ? `${pct(lo, out).toFixed(1)}\u2013${pctLabel(hi, out)}`
                              : pctLabel(lo, out)}
                        </td>
                        <td style={{ color: "var(--text-muted)" }}>
                          {out > 0 ? `${need} / ${out}` : "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.6rem", lineHeight: 1.6 }}>
              Only exams you created are listed. A score shown as a range has items
              still waiting for your decision — the lower number is what the student
              has already earned, and its percentage is shown as the same range.
              Passing Score is {mark}% of each exam's total, rounded — change the
              box above to see another mark. It is not saved with the exam.
            </p>
          </>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          <Button variant="secondary" onClick={() => router.push(backToListHref(from))}>
            ← Back to List of Students
          </Button>
        </div>
      </main>
    </div>
  );
}