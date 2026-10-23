"use client";
/**
 * FIX 2026-09-22 (Observation, page 5): "It can be saved without Image so
 * validation like missing blanks should also apply to Text Fields and No
 * Image Uploaded."
 *  - Exam Name: required, at least 7 characters
 *  - Description: required
 *  - Every page row must have an image (at least Page 1)
 *  - Only image files are accepted
 * Errors are shown under each field plus a banner, and nothing is sent to the
 * backend until everything is valid — so an exam with no answer-key image can
 * no longer be created.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import Button from "@/components/ui/Button";
import { useExams } from "@/hooks/useExams";
import { getToken } from "@/lib/auth";
import { examService } from "@/services/examService";
import { checkExamName, checkDescription, tidyText, tidyMultiline }
  from "@/lib/textField";
// NEW 2026-10-23 (Doc Rubrica, 5th comment): several pages in one dialog.
import { planPageFiles, isImageFile } from "@/lib/pageFiles";

interface PageRow { pageNumber: number; file: File | null; }

// NEW 2026-10-23: Create Exam had NO page cap while Edit Exam's dropdown stops
// at 10 - an exam created with 12 pages could not be edited afterwards,
// because the select had no option matching its own value. Both are 10 now.
const MAX_PAGES = 10;
// CHANGED 2026-10-23: the local IMAGE_EXT / isImage pair is gone - the same
// check lives in lib/pageFiles.ts as isImageFile.

export default function CreateExamForm() {
  const router = useRouter();
  const { createExam, error } = useExams();
  const [examName, setExamName] = useState("");
  const [description, setDescription] = useState("");
  const [pages, setPages] = useState<PageRow[]>([{ pageNumber: 1, file: null }]);
  const [pagesOpen, setPagesOpen] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [pageErrors, setPageErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addPage = () => setPages(prev =>
    prev.length >= MAX_PAGES ? prev : [...prev, { pageNumber: prev.length + 1, file: null }]);
  const removeLastPage = () => setPages(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  /**
   * CHANGED 2026-10-23 (Doc Rubrica, 5th comment): the zone accepts SEVERAL
   * images, from the file dialog or dropped together, and they fill this page
   * and the pages after it, adding any that do not exist yet. Picking ONE file
   * behaves exactly as it did before.
   */
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
    setNameError(null); setDescError(null); setSubmitError(null);

    // CHANGED 2026-10-22 (Doc Rubrica): the required / length checks moved
    // into lib/textField.ts together with the character rules, so this form,
    // Edit Exam and schemas/exam.py all say the same words in the same order.
    // The wording of the existing messages is unchanged - "Exam name is
    // required." and "Exam name must be at least 7 characters long." - except
    // that the first one used to read "Exam Name" while the second read
    // "Exam name", one line apart.
    const nameMsg = checkExamName(name);
    if (nameMsg) { setNameError(nameMsg); ok = false; }

    const descMsg = checkDescription(desc);
    if (descMsg) { setDescError(descMsg); ok = false; }

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

  const handleSave = async () => {
    if (!validate()) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    setSaving(true);
    let createdId: number | null = null;
    try {
      // FIX 2026-10-22: tidy, not trim - the server collapses runs of
      // whitespace, so send what it would have stored anyway.
      const exam = await createExam({
        exam_name: tidyText(examName), description: tidyMultiline(description),
      });
      if (!exam) return;             // useExams already set `error`
      createdId = exam.exam_id;
      for (const p of pages) {
        if (p.file) await examService.uploadPage(exam.exam_id, p.pageNumber, p.file, token);
      }
      router.push(`/exams/${exam.exam_id}`);
    } catch (e: unknown) {
      // An image failed to upload → remove the half-created exam so it is not
      // saved without its answer-key image.
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

      <div className="create-exam-form">
        <label className="form-label" htmlFor="exam-name">Exam Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span></label>
        <input
          id="exam-name"
          className="form-input"
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