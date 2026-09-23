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

interface PageRow { pageNumber: number; file: File | null; }

const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;
const isImage = (f: File) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name);

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

  const addPage = () => setPages(prev => [...prev, { pageNumber: prev.length + 1, file: null }]);
  const removeLastPage = () => setPages(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const setPageFile = (idx: number, file: File) => {
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, file } : p)));
    setPageErrors(prev => {
      const next = { ...prev };
      if (isImage(file)) delete next[idx];
      else next[idx] = "Only image files (JPG, PNG) are allowed.";
      return next;
    });
  };

  const validate = (): boolean => {
    let ok = true;
    const name = examName.trim();
    const desc = description.trim();
    setNameError(null); setDescError(null); setSubmitError(null);

    if (!name) { setNameError("Exam Name is required."); ok = false; }
    else if (name.length < 7) { setNameError("Exam name must be at least 7 characters long."); ok = false; }

    if (!desc) { setDescError("Description is required."); ok = false; }

    const pErr: Record<number, string> = {};
    pages.forEach((p, i) => {
      if (!p.file) pErr[i] = `Please upload an image for Page ${p.pageNumber}.`;
      else if (!isImage(p.file)) pErr[i] = "Only image files (JPG, PNG) are allowed.";
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
      const exam = await createExam({ exam_name: examName.trim(), description: description.trim() });
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
                          onFile={f => setPageFile(idx, f)}
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
              <button type="button" className="btn-secondary" style={{ fontSize: "0.8rem" }} onClick={addPage} disabled={saving}>
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