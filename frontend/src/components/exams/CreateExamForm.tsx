"use client";
/**
 * FIX 2026-09-22 (Observation, page 5): "It can be saved without Image so
 * validation like missing blanks should also apply to Text Fields and No
 * Image Uploaded."
 *  - Exam Name: required, at least 7 characters
 *  - Description: required
 *  - Subject, Schedule: required          NEW 2026-11-04 (Doc Rubrica)
 *  - Every page row must have an image (at least Page 1)
 *  - Only image files are accepted
 * Errors are shown under each field plus a banner, and nothing is sent to the
 * backend until everything is valid — so an exam with no answer-key image can
 * no longer be created.
 */
import { useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
// NEW 2026-11-23 — Ms. Melanie, page 18 requirement 3.
//
// CORRECTED 2026-11-23: this said "Shared with Set Up Profile and Edit
// Profile, which have the same column of boxes." lib/formNav.ts was written
// to be shared with them — that is why it is a module and not a handler in
// this file — but NEITHER of those screens imports it yet. Melanie's
// requirement 3 names Create Exam, so only Create Exam was wired. The
// sentence described the intention as though it were the state.
import { advanceOnEnter, makeFieldCheck } from "@/lib/formNav";
import FileUpload from "@/components/ui/FileUpload";
import Button from "@/components/ui/Button";
import { useExams } from "@/hooks/useExams";
import { getToken } from "@/lib/auth";
import { examService } from "@/services/examService";
import { checkExamName, checkDescription, checkSubject, checkSection,
         tidyText, tidyMultiline } from "@/lib/textField";
import { planPageFiles, isImageFile } from "@/lib/pageFiles";

interface PageRow { pageNumber: number; file: File | null; }

const MAX_PAGES = 10;

export default function CreateExamForm() {
  const router = useRouter();
  const { createExam, error } = useExams();
  const [examName, setExamName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [schedule, setSchedule] = useState("");
  const [pages, setPages] = useState<PageRow[]>([{ pageNumber: 1, file: null }]);
  const [pagesOpen, setPagesOpen] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);    // NEW 2026-11-04
  const [scheduleError, setScheduleError] = useState<string | null>(null);  // NEW 2026-11-04
  const [pageErrors, setPageErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* NEW 2026-11-23 — req 3. The walk is scoped to this card AND to
   * `.form-input`, because the card also holds the answer-key file pickers
   * and Enter from the last text box must not land the cursor on a file
   * input. See lib/formNav.ts. */
  const cardRef = useRef<HTMLDivElement>(null);

  const addPage = () => setPages(prev =>
    prev.length >= MAX_PAGES ? prev : [...prev, { pageNumber: prev.length + 1, file: null }]);
  const removeLastPage = () => setPages(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const setPageFiles = (idx: number, files: File[]) => {
    const plan = planPageFiles({
      files, startIndex: idx, currentRows: pages.length, maxRows: MAX_PAGES,
    });
    if (plan.assign.length === 0) {
      if (plan.message) setSubmitError(plan.message);
      return;
    }
    setPages(prev => {
      const next = [...prev];
      while (next.length < plan.totalRows) {
        next.push({ pageNumber: next.length + 1, file: null });
      }
      for (const { index, file } of plan.assign) {
        next[index] = { ...next[index], file };
      }
      return next;
    });
    setPageErrors(prev => {
      const next = { ...prev };
      for (const { index } of plan.assign) delete next[index];
      return next;
    });
    setSubmitError(plan.message);
  };

  const validate = (): boolean => {
    let ok = true;
    const name = examName.trim();
    const desc = description.trim();
    const subj = subject.trim();      // NEW 2026-11-04
    const sched = schedule.trim();    // NEW 2026-11-04
    setNameError(null); setDescError(null);
    setSubjectError(null); setScheduleError(null);
    setSubmitError(null);

    const nameMsg = checkExamName(name);
    if (nameMsg) { setNameError(nameMsg); ok = false; }

    const descMsg = checkDescription(desc);
    if (descMsg) { setDescError(descMsg); ok = false; }

    const subjMsg = checkSubject(subj);
    if (subjMsg) { setSubjectError(subjMsg); ok = false; }

    /* CHANGED 2026-11-24 — checkSchedule -> checkSection.

    THE OPEN QUESTION IN THIS COMMENT IS ANSWERED, and the answer is no:
    checkSchedule enforces LENGTH AND CHARACTERS, not a day/time shape, so
    "BSCS 1B" was never going to be refused. What it does instead is say
    "Schedule is required." under a box labelled Section — seen on
    learnlens.tech — and accept "---" as a section.

    checkSection has existed since 2026-11-15 and NOTHING CALLED IT. It says
    the right word and refuses "---". MEASURED over 8 section-shaped values
    and 6 legacy day/time ones: the two functions agree on everything
    section-shaped, and differ only on the COLON. */
    const schedMsg = checkSection(sched, true);
    if (schedMsg) { setScheduleError(schedMsg); ok = false; }

    const pErr: Record<number, string> = {};
    pages.forEach((p, i) => {
      if (!p.file) pErr[i] = `Please upload an image for Page ${p.pageNumber}.`;
      else if (!isImageFile(p.file)) pErr[i] = "Only image files (JPG, PNG) are allowed.";
    });
    setPageErrors(pErr);
    if (Object.keys(pErr).length) { ok = false; setPagesOpen(true); }

    if (!ok) setSubmitError("Some fields require your attention.");
    return ok;
  };

  /* NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3, FIFTH revision:
   *
   *   "Apply validation if you click enter in the first box and it's blank,
   *    and contains special characters, that when the validaition appears,
   *    once first box has been entered with info then it will proceed to
   *    second box, apply it as well in the succeeding input box"
   *
   * THE SAME FOUR FUNCTIONS validate() uses, against the same four setters,
   * keyed by the id each box already carries. Deliberately not a second set
   * of rules: a screen whose Enter key and whose Save button disagree about
   * what is valid is worse than one that only checks on Save.
   *
   * Save still calls validate() — this does not replace it. A teacher who
   * never presses Enter must still be stopped. */
  const fieldCheck = useMemo(() => makeFieldCheck({
    "exam-name":    { check: checkExamName,    show: setNameError },
    "exam-desc":    { check: checkDescription, show: setDescError },
    "exam-subject": { check: checkSubject,     show: setSubjectError },
    "exam-section": { check: v => checkSection(v, true), show: setScheduleError },
  }), []);

  const handleSave = async () => {
    if (!validate()) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    setSaving(true);
    let createdId: number | null = null;
    try {
      const exam = await createExam({
        exam_name: tidyText(examName), description: tidyMultiline(description),
        subject: tidyText(subject), schedule: tidyText(schedule),
      });
      if (!exam) return;             // useExams already set `error`
      createdId = exam.exam_id;
      for (const p of pages) {
        if (p.file) await examService.uploadPage(exam.exam_id, p.pageNumber, p.file, token);
      }
      router.push(`/exams/${exam.exam_id}`);
    } catch (e: unknown) {
      if (createdId !== null) {
        try { await examService.delete(createdId, token); } catch { /* ignore */ }
      }
      setSubmitError(e instanceof Error ? e.message : "Failed to save exam. Please try again.");
    } finally { setSaving(false); }
  };

  const handleCancel = () => router.push("/exams");
  const fieldErr = (msg: string | null) =>
    msg && <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem" }}>{msg}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h1 className="page-title" style={{ marginBottom: "1.5rem" }}>Create Exam</h1>

      <div
        className="create-exam-form"
        ref={cardRef}
        /* NEW 2026-11-23 — req 3: "press enter key, it will go to the 1st
           Column of the second box."
           On the LAST text box, advanceOnEnter returns false and nothing
           happens — deliberately. Saving from there would fail on the missing
           answer-key images every single time, because the images are chosen
           after the text, so Enter would come to mean "show me an error". */
        onKeyDown={e => { advanceOnEnter(e, cardRef.current, ".form-input", fieldCheck); }}
      >
        {/* NEW 2026-11-23 — Ms. Melanie, page 18 requirement 1, RED circle,
            her words: "Put directions for user because not everyone is
            technically inclined, make every form user friendly; Application
            is for Set Up Profile (For New Users), and Create Exam". She
            circled the empty strip at the top of this card.

            CORRECTED 2026-11-24 after reading the original document. This
            comment used to quote her as asking for "Please put Reminder here
            as 'Please fill-up all information:'". She did not write that — I
            did, and then quoted it back as hers. The line below is one
            reasonable reading of "put directions"; it is NOT the only one,
            and she asked for DIRECTIONS for someone not technically
            inclined, which is more than a reminder to fill the form in.
            Open with her before the defence.

            A REMINDER, NOT AN ALERT. No role="alert" and no error colours:
            nothing has gone wrong yet, and the error banner at the foot of
            this form must stay the only red thing on the screen. */}
        <p style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--navy)",
                    margin: "0 0 0.5rem" }}>
          Please fill-up all information:
        </p>

        {/* NEW 2026-11-24 — the DIRECTIONS half of requirement 1. The line
            above is a reminder; she asked for directions "because not
            everyone is technically inclined", which is a different thing.

            FOUR STEPS, not a paragraph: a teacher who is not technically
            inclined reads a numbered list and skips a block of prose. Step 4
            exists because nothing on this form currently says what happens
            after Save — that the answer key is read from the image and comes
            back for confirmation — and a form that does not say what the
            button does is the opposite of user friendly.

            Plain words on purpose: "photo or scan", not "upload an image
            asset"; "the way they appear on your class list", not "must match
            the roster". NOT an alert: nothing has gone wrong. */}
        <ol style={{ margin: "0 0 1.25rem", paddingLeft: "1.1rem",
                     fontSize: "0.8rem", lineHeight: 1.65,
                     color: "var(--text-muted)" }}>
          <li>Give the exam a name, and a short description of which class it is for.</li>
          <li>Type the subject and the section the way they appear on your class list.</li>
          <li>Upload a photo or scan of your answer key &mdash; one image per page.
              Use <strong>+ Add page</strong> if your key is more than one sheet.</li>
          <li>Press <strong>Save</strong>. LearnLens reads the answers from your key
              and shows them to you to confirm before any paper is checked.</li>
        </ol>

        <label className="form-label" htmlFor="exam-name">Exam Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span></label>
        <input
          id="exam-name"
          className="form-input"
          /* NEW 2026-11-23 — req 3: "automatic the cursor will position on
             the 1st Column of the First Input Box." */
          autoFocus
          value={examName}
          onChange={e => { setExamName(e.target.value); setNameError(null); }}
          placeholder="e.g. Long Exam 1"
          aria-required="true"
          aria-invalid={!!nameError}
          disabled={saving}
          style={nameError ? { borderBottomColor: "var(--error)" } : undefined}
        />
        {fieldErr(nameError)}

        <label className="form-label" htmlFor="exam-desc">Description <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span></label>
        <input
          id="exam-desc"
          className="form-input"
          value={description}
          onChange={e => { setDescription(e.target.value); setDescError(null); }}
          placeholder="e.g. Midterm for BSCS 3A"
          aria-required="true"
          aria-invalid={!!descError}
          disabled={saving}
          style={descError ? { borderBottomColor: "var(--error)" } : undefined}
        />
        {fieldErr(descError)}

        {/* NEW 2026-11-04 (Doc Rubrica, consultation): Subject and Schedule,
            between Description and the Answer Key section so the Exam Info
            fields stay together. */}
        <label className="form-label" htmlFor="exam-subject">Subject <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span></label>
        <input
          id="exam-subject"
          className="form-input"
          value={subject}
          onChange={e => { setSubject(e.target.value); setSubjectError(null); }}
          placeholder="e.g. Mathematics in the Modern World"
          aria-required="true"
          aria-invalid={!!subjectError}
          disabled={saving}
          style={subjectError ? { borderBottomColor: "var(--error)" } : undefined}
        />
        {fieldErr(subjectError)}

        {/* CHANGED 2026-11-23 — Ms. Melanie, page 18 requirement 1: "Instead
            of Schedule, replace it with 'Section'".

            THE LABEL AND THE EXAMPLE CHANGE HERE; THE WIRE DOES NOT, YET.
            `schedule` is still the state name, still the payload key and
            still the database column. Renaming the payload key on its own
            would send `section` to an API that wants `schedule` and 422 every
            Create Exam until the backend caught up. The column rename is one
            migration plus about a dozen files and it lands as a SINGLE push —
            see PAGE18-MELANIE-2026-11-23.md. Until then this box says Section
            and stores it in the schedule column, which is the honest state of
            a rename in progress.

            NOTE on validation: this still calls checkSchedule(). If that
            function enforces a day/time shape rather than just length and
            characters, a section name like "BSCS 3A" will be refused — and
            that is a thing to check in lib/textField.ts before showing this
            to Ms. Melanie. */}
        <label className="form-label" htmlFor="exam-section">Section <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span></label>
        <input
          id="exam-section"
          className="form-input"
          value={schedule}
          onChange={e => { setSchedule(e.target.value); setScheduleError(null); }}
          placeholder="e.g. BSCS 3A"
          aria-required="true"
          aria-invalid={!!scheduleError}
          disabled={saving}
          style={scheduleError ? { borderBottomColor: "var(--error)" } : undefined}
        />
        {fieldErr(scheduleError)}

        <p className="form-label" style={{ marginBottom: "0.75rem" }}>
          Answer Key <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
        </p>

        <div style={{ marginBottom: "1.25rem" }}>
          <button
            type="button"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none",
                     cursor: "pointer", color: "var(--orange)", fontWeight: 600, fontSize: "0.9rem", padding: 0 }}
            onClick={() => setPagesOpen(o => !o)}
            aria-expanded={pagesOpen}
          >
            <span className="form-label" style={{ marginBottom: 0, cursor: "pointer" }}>Pages</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                 style={{ transform: pagesOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0" }}>
            You can select or drag several images in one go — they are placed in
            page order by file name.
          </p>

          {/* REMOVED 2026-11-23 — Ms. Melanie, page 18 requirement 1, the
              BLUE circle: "Remove that information".

              This was Sir Alex's page 1 point 8 ("Put instructions if lower
              case or upper case"), added on 19 November. Two panellists, two
              answers, and the newer one wins on this screen. Grace removed
              the same box from the Answer Key panel on 22 November, so the
              two screens now agree with each other.

              WHAT IS LOST, recorded rather than waved away: nothing enforces
              upper case on the way in. AnswerKeyPanel's expandTF() turns a
              typed T into TRUE on a true/false item, but nothing upper-cases
              a letter, and nothing can reach the handwriting on the paper at
              all. If a class comes back badly read because the answers were
              written in lower case, this box is what used to say so. */}

          <div className="table-wrapper" style={{ marginTop: "0.5rem" }}>
            <table>
              <thead>
                <tr><th>Page</th><th>Image</th></tr>
              </thead>
              <tbody>
                {pages.map((p, idx) => (
                  <tr key={idx}>
                    <td style={{ width: "80px" }}>Page {p.pageNumber}</td>
                    <td>
                      {pagesOpen ? (
                        <FileUpload
                          label={p.file ? p.file.name : "Upload image…"}
                          multiple
                          onFiles={fs => setPageFiles(idx, fs)}
                        />
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{p.file ? p.file.name : "—"}</span>
                      )}
                      {pageErrors[idx] && (
                        <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
                          {pageErrors[idx]}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagesOpen && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button type="button" className="btn-secondary" style={{ fontSize: "0.8rem" }}
                onClick={addPage} disabled={saving || pages.length >= MAX_PAGES}>
                + Add page
              </button>
              {pages.length > 1 && (
                <button type="button" className="btn-secondary" style={{ fontSize: "0.8rem" }} onClick={removeLastPage} disabled={saving}>
                  − Remove last page
                </button>
              )}
            </div>
          )}
        </div>

        {(submitError || error) && (
          <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {submitError || error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <Button variant="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} loading={saving} style={{ width: "auto", padding: "0.65rem 1.5rem" }}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}