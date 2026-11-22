"use client";
/**
 * FIX 2026-09-22 (thesis p.5 / p.24):
 *  - Student Name required (not just spaces); error shown under the field.
 *  - EVERY page of the exam needs an image (it used to accept "at least one").
 *    A missing page = that page's items can't be checked.
 *  - Only image files are accepted.
 *  - If an upload fails, the half-saved paper is deleted and the error is shown
 *    (it used to continue and grade a paper with missing pages).
 *  - If checking fails, the real reason is shown (it used to say "skipped").
 *
 * CHANGED 2026-11-04 (Doc Rubrica, consultation, page 4): she struck out
 * "Student Name" and wrote "Name: [First Name] -> Split Name to Last Name &
 * First Name". One box becomes two, and student_name is composed server-side.
 *
 * CHANGED 2026-11-14 (Alex Passion / Julius Bancud, post-UAT page 2, item 4):
 * "Test Paper -> ID # Student / ID Student # -> file of Test Exam / Primary
 * Key -> Additional Table".
 *
 * A STUDENT NO. BOX ABOVE THE TWO NAMES. Type the number, and the surname and
 * given name arrive from the roster instead of being typed again - which is
 * the point of item 4, and the difference between a paper that merely SAYS a
 * name and one that is LINKED to a student by id.
 *
 * THE ROSTER IS FETCHED ONCE AND MATCHED IN THE BROWSER, rather than asking
 * the server on every keystroke. It is one class list; the match is instant
 * and works while typing, there is no debounce to get wrong, and it is the
 * same approach BatchUploadModal already takes. Matching is on
 * lower(trim(number)), which is exactly what the database's
 * ux_students_owner_number index uses - so this screen and the server agree on
 * what "the same number" means.
 *
 * NOT FOUND IS NOT AN ERROR. The number box is optional. Leave it empty, or
 * type one that is not on the roster, and the two name boxes behave exactly as
 * they did yesterday: the paper is created by name and simply has no roster
 * link. The 2026-11-12 migration was written for that case on purpose -
 * "A paper can also be added by name alone and linked later."
 *
 * CHANGED 2026-11-14, SECOND PASS (Alex & Bancud, Recommendations page 1,
 * "Student Middle Name"): a MIDDLE INITIAL box, matching the Students page.
 *
 * THE TWO PATHS GET IT DIFFERENTLY, and that is not an inconsistency:
 *
 *   MATCHED   the server already copies students.middle_name in
 *             batch_paper_service.create_for_student - it has since
 *             apply_2026-11-14_middle_name.py - so the box is filled from the
 *             roster and shown read-only, like the two names beside it. This
 *             screen is DISPLAYING what will be stored, not sending it.
 *
 *   UNMATCHED the box is typed and sent, which needed PaperCreate to gain the
 *             field - apply_2026-11-14_paper_middle.py.
 *
 * CHANGED 2026-11-15 (Grace, post-UAT): THE STUDENT NO. IS REQUIRED AND MUST
 * MATCH. An unmatched number is now a blocking error instead of a quiet
 * fallback, so the UNMATCHED path above no longer exists on this screen.
 *
 * WHAT THAT COSTS, recorded because it reverses a documented decision: the
 * 2026-11-12 migration comment says "a paper can also be added by name alone
 * and linked later", and that is no longer true here. A teacher whose roster
 * is empty cannot add a paper at all - she adds the student first. The
 * endpoint still exists and still works; nothing in the UI calls it.
 *
 * WHAT IT BUYS: every paper written from this screen carries student_id, so
 * the batch upload, the per-student lookup and ux_test_papers_exam_student
 * all hold for every row rather than for most of them.
 *
 * The three name boxes are READ-ONLY ALWAYS now. They are never typed and
 * never sent - the server reads all three off the roster row - so their
 * asterisks mark fields that must be POPULATED, which matching guarantees.
 *
 * CHANGED 2026-11-22 (Sir Alex Passion, Recommendations page 16): "During
 * upload of Individual Test Paper of Student, provide also a status bar
 * (similar to behavior of the group upload reflected in the second box)".
 * A bar in both working steps, and the two are different kinds of claim:
 * uploading is COUNTED (one request per page) and checking is ESTIMATED
 * (one request, no server-side feed, 40.1s a page measured in
 * THROUGHPUT-2026-10-23). The estimate is capped below full until the
 * answer lands. See PAGE16-STATUS-BAR-2026-11-22.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
import { studentService } from "@/services/studentService";
import { getToken } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PageUploadState, GradeResult } from "@/types/paper";
import { checkStudentNumber, middleInitial } from "@/lib/textField";
import { planPageFiles, isImageFile } from "@/lib/pageFiles";

interface Props {
  examId:    number;
  examPages: number;          // number of pages the exam has
  onClose:   () => void;
  onSuccess: () => void;
}

const MAX_PAGES = 10;

/** One roster entry, trimmed to what this dialog shows. */
interface RosterStudent {
  student_id:     number;
  student_number: string;
  last_name:      string;
  first_name:     string;
  middle_name:    string | null;
  section:        string | null;
}

const numberKey = (s: string) => s.trim().toLowerCase();

const blankPages = (n: number): PageUploadState[] =>
  Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, file: null, uploaded: false, uploading: false, error: null }));

/* ===========================================================================
 * NEW 2026-11-22 — Sir Alex Passion, Recommendations page 16:
 *
 *   "During upload of Individual Test Paper of Student, provide also a
 *    status bar (similar to behavior of the group upload reflected in the
 *    second box)"
 *
 * THE TWO PHASES ARE NOT THE SAME KIND OF THING, and the bar says which is
 * which rather than pretending otherwise.
 *
 *   UPLOADING is REAL. One request per page, and the page knows how many
 *             have come back. 2 of 2 means 2 of 2.
 *
 *   CHECKING is an ESTIMATE. It is ONE request - POST .../grade - that
 *            returns when the whole paper is done. The server reports no
 *            progress while it runs, so there is no honest way to say "page
 *            1 of 2" here. What there IS is a measured rate: 40.1 seconds a
 *            page (THROUGHPUT-2026-10-23), which is the same number the
 *            class upload already shows as "about 40s a page".
 *
 * So the checking bar is driven by elapsed time against that estimate, it is
 * CAPPED BELOW FULL until the answer actually lands, and its caption says
 * "about" and names the rate. A bar that reached 100% and then sat there
 * would be worse than the spinner it replaces: it would be wrong rather than
 * merely uninformative. And if the estimate is overrun, the caption changes
 * to say so instead of freezing.
 * ======================================================================== */

/** Measured, not guessed: 40.1 s per paper page, THROUGHPUT-2026-10-23. The
 *  class upload states the same figure to the teacher. If that modal keeps
 *  its own copy of this number, the two should be one constant - two
 *  spellings of one measurement is how they drift. */
const SECONDS_PER_PAGE = 40;
/** How far the ESTIMATED bar may fill before the server has actually
 *  answered. Not 100: the last of it belongs to the thing finishing. */
const ESTIMATE_CAP = 0.95;

/** What the UPLOADING bar shows. Real: one request per page, counted.
 *  Exported so measure/2026-11-22_upload_status.mjs can run it; nothing
 *  else imports it. */
export function uploadingProgress(uploaded: number, total: number, sending: number | null):
    { value: number; caption: string } {
  const safeTotal = Math.max(0, Math.floor(total));
  const done = Math.max(0, Math.min(safeTotal, Math.floor(uploaded)));
  return {
    value: safeTotal ? done / safeTotal : 0,
    caption: `${done} of ${safeTotal} page${safeTotal === 1 ? "" : "s"} uploaded` +
             (sending !== null ? ` — sending page ${sending}` : ""),
  };
}

/** What the CHECKING bar shows. An estimate, and the caption says so.
 *
 *  `value` never reaches 1 while this is called: the last of the bar belongs
 *  to the server answering. Past the estimate the bar stops and the words
 *  change, rather than the bar freezing with nothing to explain it. */
export function checkingProgress(pages: number, elapsedMs: number):
    { value: number; caption: string; overrun: boolean } {
  const n = Math.max(1, Math.floor(pages) || 1);
  const estimateS = n * SECONDS_PER_PAGE;
  const elapsedS = Math.max(0, Math.floor(elapsedMs / 1000));
  const overrun = elapsedS > estimateS;
  return {
    overrun,
    value: overrun ? ESTIMATE_CAP : Math.min(ESTIMATE_CAP, elapsedS / estimateS),
    caption: overrun
      ? `${elapsedS}s so far — longer than the usual ${SECONDS_PER_PAGE}s a page. ` +
        "Still working; do not close this."
      : `${elapsedS}s of about ${estimateS}s (about ${SECONDS_PER_PAGE}s a page, ` +
        `${n} page${n === 1 ? "" : "s"})`,
  };
}

function ProgressBar({ value, label, caption, estimated }: {
  /** 0..1. */
  value: number;
  /** The heading above the bar, in orange, like the class upload's. */
  label: string;
  caption: string;
  /** True when `value` is an estimate rather than a count of finished work. */
  estimated?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div style={{ textAlign: "left" }}>
      <p style={{ color: "var(--orange)", fontWeight: 700, fontSize: "0.95rem",
                  margin: "0 0 0.4rem" }}>
        {label}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        /* An estimate has no valuenow worth announcing - a screen reader
           reading "73%" of a guess states it more confidently than the
           screen does. The text is the honest channel. */
        aria-valuenow={estimated ? undefined : Math.round(pct * 100)}
        aria-valuetext={caption}
        style={{ height: 8, borderRadius: 999, background: "var(--border, #e2e8f0)",
                 overflow: "hidden" }}
      >
        <div style={{ height: "100%", width: `${pct * 100}%`,
                      background: "var(--orange)", borderRadius: 999,
                      transition: "width .3s linear" }} />
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)",
                  margin: "0.4rem 0 0" }}>
        {caption}
      </p>
    </div>
  );
}

export default function AddEditPaperModal({ examId, examPages, onClose, onSuccess }: Props) {
  const [studentNumber, setStudentNumber] = useState("");
  const [roster,        setRoster]        = useState<RosterStudent[] | null>(null);
  const [rosterError,   setRosterError]   = useState<string | null>(null);
  const [lastName,  setLastName]  = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [numberError, setNumberError] = useState<string | null>(null);
  const [pageCount,   setPageCount]   = useState(Math.max(1, examPages));
  const [pages,       setPages]       = useState<PageUploadState[]>(() => blankPages(Math.max(1, examPages)));
  const [step,        setStep]        = useState<"form" | "uploading" | "grading" | "done">("form");
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError,  setGradeError]  = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  /* NEW 2026-11-22 — Alex page 16. Elapsed milliseconds in the current
   * phase, for the checking estimate. A ref for the start instant and state
   * for the tick: the start must not be re-read on every render, and the
   * tick must cause one. */
  const phaseStart = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (step !== "uploading" && step !== "grading") return;
    phaseStart.current = Date.now();
    setElapsedMs(0);
    const t = setInterval(() => setElapsedMs(Date.now() - phaseStart.current), 250);
    return () => clearInterval(t);
  }, [step]);

  const lookupSeq = useRef(0);

  useEffect(() => {
    const typed = studentNumber.trim();
    if (!typed) { setRoster(null); setRosterError(null); return; }
    const token = getToken();
    if (!token) return;
    setRoster(null);
    setRosterError(null);
    const mine = ++lookupSeq.current;
    const timer = setTimeout(() => {
      studentService.lookup(typed, token)
        .then(s => {
          if (mine !== lookupSeq.current) return;
          setRoster([{
            student_id:     s.student_id,
            student_number: s.student_number,
            last_name:      s.last_name,
            first_name:     s.first_name,
            middle_name:    s.middle_name ?? null,
            section:        s.section ?? null,
          }]);
        })
        .catch((e: unknown) => {
          if (mine !== lookupSeq.current) return;
          setRoster([]);
          if (e instanceof ApiError && e.status === 404) return;
          setRosterError(
            "That number could not be looked up just now — check your " +
            "connection and try again.");
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [studentNumber]);

  const matched = useMemo<RosterStudent | null>(() => {
    const key = numberKey(studentNumber);
    if (!key || !roster) return null;
    return roster.find(s => numberKey(s.student_number) === key) ?? null;
  }, [studentNumber, roster]);

  useEffect(() => {
    if (!matched) return;
    setLastName(matched.last_name);
    setFirstName(matched.first_name);
    setMiddleName(matched.middle_name ?? "");
    setNumberError(null);
  }, [matched]);

  const unlink = () => {
    setStudentNumber("");
    setLastName(""); setFirstName(""); setMiddleName("");
    setNumberError(null);
  };

  const handlePageCountChange = (n: number) => {
    setPageCount(n);
    setPages(prev => blankPages(n).map((p, i) => prev[i] ?? p));
  };

  const handleFilesSelected = (idx: number, list: FileList | null) => {
    const plan = planPageFiles({
      files: list, startIndex: idx, currentRows: pages.length, maxRows: MAX_PAGES,
    });
    if (plan.assign.length === 0) {
      if (plan.message) setGlobalError(plan.message);
      return;
    }
    setPages(prev => {
      const next = [...prev, ...blankPages(plan.totalRows).slice(prev.length)];
      for (const { index, file } of plan.assign) {
        next[index] = { ...next[index], file, error: null };
      }
      return next;
    });
    setPageCount(plan.totalRows);
    setGlobalError(plan.message);
  };

  const validate = (): boolean => {
    let ok = true;
    setGlobalError(null);
    setNumberError(null);
    const numMsg = checkStudentNumber(studentNumber);
    if (numMsg) {
      setNumberError(numMsg);
      ok = false;
    } else if (roster === null) {
      setNumberError("Still looking that number up — try again in a moment.");
      ok = false;
    } else if (!matched) {
      setNumberError(
        `No student with number ${studentNumber.trim()} has been added yet. ` +
        "Ask your administrator to add them first — the paper is linked to " +
        "them by number, not by name.");
      ok = false;
    }
    const checked = pages.map(p => ({
      ...p,
      error: !p.file ? `Please upload an image for Page ${p.pageNumber}.`
           : !isImageFile(p.file) ? "Only image files (JPG, PNG) are allowed." : null,
    }));
    setPages(checked);
    if (checked.some(p => p.error)) ok = false;
    if (pageCount < examPages) {
      setGlobalError(`This exam has ${examPages} page(s). Upload all ${examPages} page(s) of the paper.`);
      ok = false;
    } else if (!ok) {
      setGlobalError("Some fields require your attention.");
    }
    return ok;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const token = getToken();
    if (!token) { setGlobalError("Session expired. Please log in again."); return; }

    setStep("uploading");
    let paperId: number | null = null;
    try {
      if (!matched) {
        setGlobalError("That student number could not be confirmed. Close this and try again.");
        setStep("form");
        return;
      }
      const paper = await paperService.createForStudent(examId, matched.student_number, token);
      paperId = paper.paper_id;

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        setPages(prev => prev.map((pg, idx) => (idx === i ? { ...pg, uploading: true } : pg)));
        try {
          await paperService.uploadPage(examId, paperId, p.pageNumber, p.file as File, token);
          setPages(prev => prev.map((pg, idx) => (idx === i ? { ...pg, uploading: false, uploaded: true } : pg)));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          setPages(prev => prev.map((pg, idx) => (idx === i ? { ...pg, uploading: false, error: msg } : pg)));
          throw new Error(`Page ${p.pageNumber} could not be uploaded: ${msg}`);
        }
      }
    } catch (e: unknown) {
      if (paperId !== null) { try { await paperService.delete(examId, paperId, token); } catch { /* ignore */ } }
      setPages(prev => prev.map(p => ({ ...p, uploaded: false, uploading: false })));
      setGlobalError(e instanceof Error ? e.message : "Something went wrong while adding the paper. Please try again.");
      setStep("form");
      return;
    }

    setStep("grading");
    try {
      setGradeResult(await paperService.grade(examId, paperId as number, token));
    } catch (e: unknown) {
      setGradeResult(null);
      setGradeError(e instanceof Error ? e.message : "Checking failed.");
    }
    setStep("done");
    onSuccess();
  };

  const busy = step === "uploading" || step === "grading";

  const nameErr = (msg: string | null) =>
    msg && (
      <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem" }}>
        {msg}
      </p>
    );

  const lockedInput = { background: "var(--bg, #f4f4f5)", color: "var(--text-muted)" };

  return (
    <Modal title="Add Paper" onClose={busy ? () => {} : onClose}>
      {step === "form" && (
        <>
          <label className="form-label" htmlFor="student-number">
            Student No. <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="student-number" className="form-input" value={studentNumber}
            onChange={e => { setStudentNumber(e.target.value); setNumberError(null); setGlobalError(null); }}
            placeholder="e.g. 2021-00000123" autoComplete="off"
            aria-required="true" aria-invalid={!!numberError}
            style={numberError ? { borderBottomColor: "var(--error)" } : undefined}
            aria-describedby="student-number-hint" />
          {nameErr(numberError)}

          <p id="student-number-hint" style={{
            fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem",
            color: matched ? "var(--navy)" : "var(--text-muted)",
          }}>
            {rosterError
              ? rosterError
              : matched
              ? <>
                  Linked to <strong>
                    {matched.last_name}, {matched.first_name}
                    {middleInitial(matched.middle_name) ? ` ${middleInitial(matched.middle_name)}` : ""}
                  </strong>
                  {matched.section ? ` — ${matched.section}` : ""}.{" "}
                  <button type="button" onClick={unlink}
                    style={{ background: "none", border: "none", padding: 0, font: "inherit",
                             color: "var(--orange)", textDecoration: "underline", cursor: "pointer" }}>
                    Clear
                  </button>
                </>
              : studentNumber.trim()
              ? (roster === null
                  ? "Looking that number up…"
                  : "No student with that number has been added yet. Ask your administrator to add them first.")
              : "Type the number written on the paper. The names fill in from the school roster."}
          </p>

          <label className="form-label" htmlFor="last-name">
            Last Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="last-name" className="form-input" value={lastName} readOnly
            placeholder="fills in from the school roster" aria-required="true"
            style={lockedInput} />

          <label className="form-label" htmlFor="first-name">
            First Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="first-name" className="form-input" value={firstName} readOnly
            placeholder="fills in from the school roster" aria-required="true"
            style={lockedInput} />

          <label className="form-label" htmlFor="middle-name">
            Middle Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="middle-name" className="form-input" value={middleName} readOnly
            placeholder="fills in from the school roster" aria-required="true"
            style={lockedInput} />

          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label" htmlFor="page-count">Pages</label>
            <select id="page-count" className="dropdown" value={pageCount}
              onChange={e => handlePageCountChange(Number(e.target.value))} style={{ width: "80px" }}>
              {Array.from({ length: MAX_PAGES }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {examPages > 0 && (
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "0.6rem" }}>
                The exam has {examPages} page(s).
              </span>
            )}
          </div>

          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
            You can select several images in one go — they are placed in page order by file name.
          </p>

          <div className="table-wrapper" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead><tr><th style={{ width: "60px" }}>Page</th><th>Image <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span></th></tr></thead>
              <tbody>
                {pages.map((p, idx) => (
                  <tr key={p.pageNumber}>
                    <td>{p.pageNumber}</td>
                    <td>
                      <label style={{
                        display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer",
                        background: p.file ? "var(--orange-light)" : "var(--navy)", color: p.file ? "var(--orange)" : "#fff",
                        border: p.error ? "1px solid var(--error)" : p.file ? "1px solid var(--orange)" : "none",
                        borderRadius: "6px", padding: "0.35rem 0.8rem", fontSize: "0.82rem", fontWeight: 600,
                      }}>
                        {p.file ? `✓ ${p.file.name.slice(0, 20)}${p.file.name.length > 20 ? "…" : ""}` : `Upload Page ${p.pageNumber}`}
                        <input type="file" accept="image/*" multiple style={{ display: "none" }}
                          onChange={e => { handleFilesSelected(idx, e.target.files); e.target.value = ""; }} />
                      </label>
                      {p.error && (
                        <p role="alert" style={{ color: "var(--error)", fontSize: "0.75rem", margin: "0.3rem 0 0" }}>{p.error}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {globalError && (
            <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
              {globalError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} style={{ width: "auto", padding: "0.65rem 1.5rem" }}>Save</Button>
          </div>
        </>
      )}

      {step === "uploading" && (
        <div style={{ padding: "1.5rem 0", textAlign: "center" }}>
          {pages.map(p => (
            <div key={p.pageNumber} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", justifyContent: "center" }}>
              {p.uploaded ? <span style={{ color: "var(--success)", fontWeight: 600 }}>✓</span>
                : p.uploading ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} />
                : <span style={{ color: "var(--text-muted)" }}>○</span>}
              <span style={{ fontSize: "0.875rem", color: "var(--navy)" }}>Page {p.pageNumber}</span>
            </div>
          ))}
          {/* NEW 2026-11-22 — Alex page 16. REAL progress: one request per
              page, counted as each comes back. */}
          <div style={{ marginTop: "1rem" }}>
            <ProgressBar
              label="Uploading"
              {...uploadingProgress(
                pages.filter(p => p.uploaded).length,
                pages.length,
                pages.find(p => p.uploading)?.pageNumber ?? null,
              )}
            />
          </div>
        </div>
      )}

      {step === "grading" && (() => {
        /* NEW 2026-11-22 — Alex page 16. ESTIMATED progress, and labelled as
           such. One request, no server-side feed; the only real input is the
           measured rate and how long we have been waiting. */
        const p = checkingProgress(pages.length, elapsedMs);
        return (
          <div style={{ padding: "1.5rem 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem",
                          justifyContent: "center", marginBottom: "1.25rem" }}>
              <span className="spinner spinner-dark" style={{ width: 20, height: 20, borderWidth: 2 }} />
              <span style={{ fontSize: "0.9rem", color: "var(--navy)" }}>
                Running OCR and checking…
              </span>
            </div>
            <ProgressBar estimated label="Checking"
                         value={p.value} caption={p.caption} />
          </div>
        );
      })()}

      {step === "done" && (
        <div style={{ padding: "1rem 0", textAlign: "center" }}>
          {gradeResult ? (
            <>
              <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--navy)", marginBottom: "0.3rem" }}>
                {gradeResult.is_final
                  ? `${gradeResult.correct} / ${gradeResult.total_items} correct`
                  : `${gradeResult.correct}–${gradeResult.max_possible} of ${gradeResult.total_items} correct`}
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                Score: <strong style={{ color: "var(--orange)" }}>{gradeResult.score_percent}%</strong>
              </p>
              {!gradeResult.is_final && (
                <div role="status" className="alert alert-error" style={{ marginBottom: "1.25rem", fontSize: "0.82rem", textAlign: "left" }}>
                  {gradeResult.needs_review} item(s) need your decision before this score is final
                  {gradeResult.review_items.length > 0 && ` (question ${gradeResult.review_items.join(", ")})`}.
                </div>
              )}
              {gradeResult.warning && (
                <div role="status" className="alert alert-error" style={{ marginBottom: "1.25rem", fontSize: "0.82rem", textAlign: "left" }}>
                  {gradeResult.warning}
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: "0.9rem", color: "var(--navy)", marginBottom: "0.5rem" }}>Paper saved, but it could not be checked.</p>
              <div role="alert" className="alert alert-error" style={{ marginBottom: "1.25rem", fontSize: "0.82rem", textAlign: "left" }}>
                {gradeError}
              </div>
            </>
          )}
          <Button variant="primary" onClick={onClose} style={{ width: "auto", padding: "0.65rem 1.75rem" }}>Done</Button>
        </div>
      )}
    </Modal>
  );
}