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
 */
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
// NEW 2026-11-14 — the roster, for the Student No. lookup.
import { studentService } from "@/services/studentService";
import { getToken } from "@/lib/auth";
import { PageUploadState, GradeResult } from "@/types/paper";
// CHANGED 2026-11-04: checkNamePart replaces checkStudentName. student_name is
// no longer typed by the teacher, so validating it as user input is now wrong -
// the apostrophe is legal in a name part and illegal under the label rule, so
// "O'Brien" would be accepted here and refused by the API.
//
// CHANGED 2026-11-14: checkMiddleName and middleInitial. Both are the browser
// copies of the functions in backend/app/schemas/_text.py, which is the point
// of that module existing - the screen and the server must agree on what a
// middle name may contain and on how "R" is written inside a composed name.
// CHANGED 2026-11-15: checkNamePart, checkMiddleName and tidyText are gone
// from this screen. Nothing here types or sends a name any more - the server
// reads all three from the roster - so validating them here would refuse a
// value this dialog cannot edit. checkStudentNumber is the one rule left.
import { checkStudentNumber, middleInitial } from "@/lib/textField";
// NEW 2026-10-23 (Doc Rubrica, 5th comment): several pages in one dialog.
import { planPageFiles, isImageFile } from "@/lib/pageFiles";

interface Props {
  examId:    number;
  examPages: number;          // number of pages the exam has
  onClose:   () => void;
  onSuccess: () => void;
}

const MAX_PAGES = 10;
// CHANGED 2026-10-23: the local IMAGE_EXT / isImage pair is gone - the same
// check now lives in lib/pageFiles.ts as isImageFile, so the multi-file
// picker and validate() cannot disagree about what counts as an image.

/** One roster entry, trimmed to what this dialog shows. */
interface RosterStudent {
  student_id:     number;
  student_number: string;
  last_name:      string;
  first_name:     string;
  // NEW 2026-11-14. Nullable, like the column - a student with no middle name
  // and a student with an empty one must not be two different things.
  middle_name:    string | null;
  section:        string | null;
}

/** The same key the database's unique index uses: lower(trim(number)).
 *  Anything else and the screen would call "2021-A123" and "2021-a123"
 *  different students while the server calls them the same one. */
const numberKey = (s: string) => s.trim().toLowerCase();

const blankPages = (n: number): PageUploadState[] =>
  Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, file: null, uploaded: false, uploading: false, error: null }));

export default function AddEditPaperModal({ examId, examPages, onClose, onSuccess }: Props) {
  // NEW 2026-11-14 — the roster lookup.
  const [studentNumber, setStudentNumber] = useState("");
  const [roster,        setRoster]        = useState<RosterStudent[] | null>(null);
  const [rosterError,   setRosterError]   = useState<string | null>(null);
  // CHANGED 2026-11-04: one studentName state becomes two.
  const [lastName,  setLastName]  = useState("");
  const [firstName, setFirstName] = useState("");
  // NEW 2026-11-14 — the third, OPTIONAL part.
  const [middleName, setMiddleName] = useState("");
  // CHANGED 2026-11-15: one error, on the only box that is typed.
  const [numberError, setNumberError] = useState<string | null>(null);
  const [pageCount,   setPageCount]   = useState(Math.max(1, examPages));
  const [pages,       setPages]       = useState<PageUploadState[]>(() => blankPages(Math.max(1, examPages)));
  const [step,        setStep]        = useState<"form" | "uploading" | "grading" | "done">("form");
  // CHANGED 2026-11-04: the whole GradeResult is kept instead of four renamed
  // fields. types/paper.ts was missing max_possible / needs_review /
  // review_items / is_final entirely, so this screen could not say that a
  // paper was still under review even though the API said so on every grade.
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError,  setGradeError]  = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // NEW 2026-11-14. Once, on open. A failure here is NOT fatal and is not even
  // shown as an error: the dialog still works exactly as it did before, by
  // name. It would be wrong to block adding a paper because a roster this
  // teacher may never have filled in could not be read.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    studentService.list(token)
      .then(list => setRoster(list.map(s => ({
        student_id:     s.student_id,
        student_number: s.student_number,
        last_name:      s.last_name,
        first_name:     s.first_name,
        middle_name:    s.middle_name ?? null,
        section:        s.section ?? null,
      }))))
      .catch(() => { setRoster([]); setRosterError("Your student list could not be loaded, so numbers cannot be looked up. You can still type the names."); });
  }, []);

  const matched = useMemo<RosterStudent | null>(() => {
    const key = numberKey(studentNumber);
    if (!key || !roster) return null;
    return roster.find(s => numberKey(s.student_number) === key) ?? null;
  }, [studentNumber, roster]);

  // When a number matches, the names come off the roster. They are NOT merely
  // suggested: the save path sends the number, and the server reads the names
  // itself, so what is shown here has to be what will be stored.
  //
  // CHANGED 2026-11-14: the middle name too. It is filled from the roster
  // rather than left blank because the server WILL store it - it is copied in
  // batch_paper_service.create_for_student - and a box that stays empty while
  // the saved paper gains an initial would be a screen that lies.
  useEffect(() => {
    if (!matched) return;
    setLastName(matched.last_name);
    setFirstName(matched.first_name);
    setMiddleName(matched.middle_name ?? "");
    setNumberError(null);
  }, [matched]);

  /** CHANGED 2026-11-15. Clear BOTH the number and the names.
   *
   *  It used to keep the names so a teacher could correct a spelling for one
   *  paper. That is no longer possible - the names are read-only and come
   *  from the roster - so leaving them filled after Clear would show a name
   *  belonging to a student this paper is no longer linked to. Spelling is
   *  corrected on the Students page, where it belongs. */
  const unlink = () => {
    setStudentNumber("");
    setLastName(""); setFirstName(""); setMiddleName("");
    setNumberError(null);
  };

  const handlePageCountChange = (n: number) => {
    setPageCount(n);
    setPages(prev => blankPages(n).map((p, i) => prev[i] ?? p));   // keep files already chosen
  };

  // CHANGED 2026-10-23 (Doc Rubrica, 5th comment): "why add a page at a time
  // when I can select them all at once?" The input is now `multiple`, and the
  // files fill this row and the rows after it, creating any that are missing.
  // Picking ONE file behaves exactly as it did before.
  const handleFilesSelected = (idx: number, list: FileList | null) => {
    const plan = planPageFiles({
      files: list, startIndex: idx, currentRows: pages.length, maxRows: MAX_PAGES,
    });
    if (plan.assign.length === 0) {
      if (plan.message) setGlobalError(plan.message);
      return;
    }
    setPages(prev => {
      // grow to the length the plan needs, keeping page numbers 1..N
      const next = [...prev, ...blankPages(plan.totalRows).slice(prev.length)];
      for (const { index, file } of plan.assign) {
        next[index] = { ...next[index], file, error: null };
      }
      return next;
    });
    setPageCount(plan.totalRows);          // the dropdown follows the selection
    setGlobalError(plan.message);          // null when everything fitted
  };

  const validate = (): boolean => {
    let ok = true;
    setGlobalError(null);
    setNumberError(null);
    // CHANGED 2026-11-15. ONE rule, on the one box that is typed.
    //
    // The three name boxes are not checked because they are not typed and not
    // sent: the server reads all three off the roster row the number names.
    // Validating them here would let a name the teacher legitimately saved on
    // the Students page block a paper on a screen that cannot edit it.
    //
    // THE ORDER MATTERS. The character rule runs first, so "2021 00123" is
    // told it has a space rather than being told it is not on the list - the
    // second sentence would send the teacher to the roster to look for a
    // student who is already there.
    const numMsg = checkStudentNumber(studentNumber);
    if (numMsg) {
      setNumberError(numMsg);
      ok = false;
    } else if (roster === null) {
      // The fetch has not landed. Saying "not on your list" here would be a
      // claim we cannot support yet.
      setNumberError("Still reading your student list — try again in a moment.");
      ok = false;
    } else if (!matched) {
      setNumberError(
        "That number is not on your student list. Add the student on the " +
        "Students page first, then come back — the paper is linked to them " +
        "by number, not by name.");
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
      // CHANGED 2026-11-14 — two create paths, chosen by whether a roster
      // student is matched.
      //
      // MATCHED: send the NUMBER. The server looks the student up and writes
      // student_id as well as the names - and, since
      // apply_2026-11-14_middle_name.py, the middle name - which is what makes
      // the paper linked rather than merely similarly spelled. It answers 404
      // if the roster changed since this dialog opened, and 409 if that student
      // already has a paper on this exam - a rule the database enforces with
      // ux_test_papers_exam_student, so it cannot be worked around from here.
      //
      // UNMATCHED: the 2026-11-04 call, with the middle name added. One object,
      // not positional strings. All three parts are strings, so TypeScript
      // cannot catch them being swapped - what the object DOES catch is an
      // omitted field (TS2741), and it names each value at the call site so a
      // reader can see which is which.
      //
      // tidyText, not trim - the server collapses runs of whitespace, so send
      // what it would have stored anyway. `|| null` rather than "" because the
      // column must not hold two spellings of "no middle name"; the server
      // does the same coercion, and agreeing with it here means the value
      // round-trips unchanged.
      // CHANGED 2026-11-15: ONE create path. validate() has already proved a
      // roster student is matched, so `matched` cannot be null here - but it
      // is checked rather than asserted, because a non-null assertion would
      // be a promise about a race (the roster reloading between validate and
      // save) that nothing in this file actually prevents.
      if (!matched) {
        setGlobalError("That student number is no longer on your list. Close this and try again.");
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
      // Don't leave a paper with missing pages behind
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

  // NEW 2026-11-14, ALWAYS ON as of 2026-11-15. Read-only rather than
  // disabled: a disabled input is skipped by the keyboard and greyed to the
  // point of looking broken, and the teacher still needs to be able to select
  // and read the name that will be stored.
  const lockedInput = { background: "var(--bg, #f4f4f5)", color: "var(--text-muted)" };

  return (
    <Modal title="Add Paper" onClose={busy ? () => {} : onClose}>
      {step === "form" && (
        <>
          {/* NEW 2026-11-14 (Alex & Bancud, item 4). FIRST, above the names,
              because it is the field that fills the other two. Optional - the
              label says so, and leaving it blank is the 2026-11-04 behaviour
              exactly. */}
          {/* CHANGED 2026-11-15: REQUIRED. It was "(optional)" from 2026-11-14
              until today, when it became the field the whole dialog turns on. */}
          <label className="form-label" htmlFor="student-number">
            Student No. <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="student-number" className="form-input" value={studentNumber}
            onChange={e => { setStudentNumber(e.target.value); setNumberError(null); setGlobalError(null); }}
            placeholder="e.g. 2021-00123" autoComplete="off"
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
                  {/* CHANGED 2026-11-14: the initial is shown here through
                      middleInitial(), the same function the server composes
                      student_name with - so this line reads exactly as the
                      stored name will. */}
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
                  : "Not on your student list. Add the student on the Students page first.")
              : "Type the number written on the paper. The names fill in from your student list."}
          </p>

          {/* CHANGED 2026-11-04. The old placeholder was "e.g. Tablizo, Eric",
              which TAUGHT the comma format the split is meant to end - and a
              comma is now refused with its own message. These two teach the
              shape the two boxes actually want.

              CHANGED 2026-11-15: read-only ALWAYS. These three come from the
              roster row the number names and are never sent from here, so
              there is nothing to type. Correct a spelling on the Students
              page; it is the one place that owns these values. */}
          <label className="form-label" htmlFor="last-name">
            Last Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="last-name" className="form-input" value={lastName} readOnly
            placeholder="fills in from your student list" aria-required="true"
            style={lockedInput} />

          <label className="form-label" htmlFor="first-name">
            First Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="first-name" className="form-input" value={firstName} readOnly
            placeholder="fills in from your student list" aria-required="true"
            style={lockedInput} />

          {/* NEW 2026-11-14 (Alex & Bancud, Recommendations page 1, "Student
              Middle Name"). AFTER First Name, matching both the panel's own
              order on that page and the Students page.

              CHANGED 2026-11-15: it HAS a red asterisk now. StudentCreate
              requires a middle name, so every roster row written from today
              carries one and this box is always filled. A row created before
              2026-11-14 may still hold NULL - it shows blank here, and that
              student has to be edited on the Students page before a paper can
              be added for them.

              Labelled "Middle Initial" and stored as a NAME, so "Reyes" is
              accepted too. Matching the panel's "Middle Name" wording later is
              a label change, not a migration. */}
          <label className="form-label" htmlFor="middle-name">
            Middle Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="middle-name" className="form-input" value={middleName} readOnly
            placeholder="fills in from your student list" aria-required="true"
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
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Uploading pages…</p>
        </div>
      )}

      {step === "grading" && (
        <div style={{ padding: "2rem 0", textAlign: "center" }}>
          <span className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>Running OCR and checking…</p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>This may take a few seconds</p>
        </div>
      )}

      {step === "done" && (
        <div style={{ padding: "1rem 0", textAlign: "center" }}>
          {gradeResult ? (
            <>
              {/* CHANGED 2026-11-04. `correct` is a FLOOR when items are still
                  under review; `max_possible` is the ceiling. Printing only
                  `correct` is the bug the backend comment named: "the browser
                  then sees '11 of 19' for a paper whose true score is 15". */}
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