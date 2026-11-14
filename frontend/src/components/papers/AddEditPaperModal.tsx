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
 * NO BACKEND CHANGE. `POST /exams/{id}/papers/by-student` has existed since
 * 2026-11-12 for the batch upload; this screen simply calls it too, through
 * the same `paperService.createForStudent`. In particular `PaperCreate` is NOT
 * widened to take an optional number - schemas/paper.py records why: when that
 * model changed on 2026-11-04 the old frontend failed with 422 on the fields
 * it no longer sent. A second create path touches nothing that works.
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
import { checkNamePart, tidyText } from "@/lib/textField";
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
  const [lastNameError,  setLastNameError]  = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
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
  useEffect(() => {
    if (!matched) return;
    setLastName(matched.last_name);
    setFirstName(matched.first_name);
    setLastNameError(null);
    setFirstNameError(null);
  }, [matched]);

  /** Clear the number and unlock the names, KEEPING what the roster filled in.
   *  The teacher is most likely correcting a spelling for this one paper, and
   *  blanking the boxes would make them retype a name they can see. */
  const unlink = () => setStudentNumber("");

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
    setLastNameError(null);
    setFirstNameError(null);
    // CHANGED 2026-11-14: the two name rules are SKIPPED when a roster student
    // is matched, because those names are then never sent - the server reads
    // them from the roster row. Checking them here would let a name the
    // teacher legitimately saved on the Students page block a paper on a
    // screen that cannot edit it.
    if (!matched) {
      // CHANGED 2026-11-04 (Doc Rubrica): two fields, same rule, same words and
      // same order as check_name_part() in backend/app/schemas/_text.py. A comma
      // in either box gets its own sentence, because a comma there means the
      // teacher typed "Surname, First name" into one of them.
      const lastMsg = checkNamePart(lastName, "Last name");
      if (lastMsg) { setLastNameError(lastMsg); ok = false; }
      const firstMsg = checkNamePart(firstName, "First name");
      if (firstMsg) { setFirstNameError(firstMsg); ok = false; }
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
      // student_id as well as the names, which is what makes the paper linked
      // rather than merely similarly spelled. It answers 404 if the roster
      // changed since this dialog opened, and 409 if that student already has
      // a paper on this exam - a rule the database enforces with
      // ux_test_papers_exam_student, so it cannot be worked around from here.
      //
      // UNMATCHED: the 2026-11-04 call, unchanged. One object, not two
      // positional strings. Both parts are `string`, so TypeScript cannot
      // catch them being swapped either way - what the object DOES catch is an
      // omitted field (TS2741), and it names each value at the call site so a
      // reader can see which is which.
      //
      // tidyText, not trim - the server collapses runs of whitespace, so send
      // what it would have stored anyway.
      if (matched) {
        const paper = await paperService.createForStudent(examId, matched.student_number, token);
        paperId = paper.paper_id;
      } else {
        const paper = await paperService.create(
          examId,
          { last_name: tidyText(lastName), first_name: tidyText(firstName) },
          token,
        );
        paperId = paper.paper_id;
      }

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

  // NEW 2026-11-14. Read-only rather than disabled: a disabled input is skipped
  // by the keyboard and greyed to the point of looking broken, and the teacher
  // still needs to be able to select and read the name that will be stored.
  const lockedInput = matched
    ? { background: "var(--bg, #f4f4f5)", color: "var(--text-muted)" }
    : undefined;

  return (
    <Modal title="Add Paper" onClose={busy ? () => {} : onClose}>
      {step === "form" && (
        <>
          {/* NEW 2026-11-14 (Alex & Bancud, item 4). FIRST, above the names,
              because it is the field that fills the other two. Optional - the
              label says so, and leaving it blank is the 2026-11-04 behaviour
              exactly. */}
          <label className="form-label" htmlFor="student-number">
            Student No.{" "}
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input id="student-number" className="form-input" value={studentNumber}
            onChange={e => { setStudentNumber(e.target.value); setGlobalError(null); }}
            placeholder="e.g. 2021-00123" autoComplete="off"
            aria-describedby="student-number-hint" />

          <p id="student-number-hint" style={{
            fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem",
            color: matched ? "var(--navy)" : "var(--text-muted)",
          }}>
            {rosterError
              ? rosterError
              : matched
              ? <>
                  Linked to <strong>{matched.last_name}, {matched.first_name}</strong>
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
                  : "Not on your student list — the names below will be used, and this paper will not be linked.")
              : "Type the number written on the paper and the names fill in from your student list."}
          </p>

          {/* CHANGED 2026-11-04. The old placeholder was "e.g. Tablizo, Eric",
              which TAUGHT the comma format the split is meant to end - and a
              comma is now refused with its own message. These two teach the
              shape the two boxes actually want.

              CHANGED 2026-11-14: read-only while a student number is matched,
              because those names come from the roster and are not sent from
              here. Edit them on the Students page, or press Clear. */}
          <label className="form-label" htmlFor="last-name">
            Last Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="last-name" className="form-input" value={lastName}
            onChange={e => { setLastName(e.target.value); setLastNameError(null); }}
            placeholder="e.g. Dela Cruz-Santos" aria-required="true" aria-invalid={!!lastNameError}
            readOnly={!!matched}
            style={lastNameError ? { borderBottomColor: "var(--error)" } : lockedInput} />
          {nameErr(lastNameError)}

          <label className="form-label" htmlFor="first-name">
            First Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="first-name" className="form-input" value={firstName}
            onChange={e => { setFirstName(e.target.value); setFirstNameError(null); }}
            placeholder="e.g. Ma. Teresa" aria-required="true" aria-invalid={!!firstNameError}
            readOnly={!!matched}
            style={firstNameError ? { borderBottomColor: "var(--error)" } : lockedInput} />
          {nameErr(firstNameError)}

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