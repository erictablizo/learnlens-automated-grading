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
 */
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
import { getToken } from "@/lib/auth";
import { PageUploadState } from "@/types/paper";

interface Props {
  examId:    number;
  examPages: number;          // number of pages the exam has
  onClose:   () => void;
  onSuccess: () => void;
}

const MAX_PAGES = 10;
const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;
const isImage = (f: File) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name);

const blankPages = (n: number): PageUploadState[] =>
  Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, file: null, uploaded: false, uploading: false, error: null }));

export default function AddEditPaperModal({ examId, examPages, onClose, onSuccess }: Props) {
  const [studentName, setStudentName] = useState("");
  const [nameError,   setNameError]   = useState<string | null>(null);
  const [pageCount,   setPageCount]   = useState(Math.max(1, examPages));
  const [pages,       setPages]       = useState<PageUploadState[]>(() => blankPages(Math.max(1, examPages)));
  const [step,        setStep]        = useState<"form" | "uploading" | "grading" | "done">("form");
  const [gradeResult, setGradeResult] = useState<{ correct: number; total: number; pct: number; warning?: string | null } | null>(null);
  const [gradeError,  setGradeError]  = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handlePageCountChange = (n: number) => {
    setPageCount(n);
    setPages(prev => blankPages(n).map((p, i) => prev[i] ?? p));   // keep files already chosen
  };

  const handleFileSelect = (idx: number, file: File) => {
    setPages(prev => prev.map((p, i) =>
      i === idx ? { ...p, file, error: isImage(file) ? null : "Only image files (JPG, PNG) are allowed." } : p));
  };

  const validate = (): boolean => {
    let ok = true;
    setGlobalError(null);
    setNameError(null);
    if (!studentName.trim()) { setNameError("Student name is required."); ok = false; }
    const checked = pages.map(p => ({
      ...p,
      error: !p.file ? `Please upload an image for Page ${p.pageNumber}.`
           : !isImage(p.file) ? "Only image files (JPG, PNG) are allowed." : null,
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
      const paper = await paperService.create(examId, studentName.trim(), token);
      paperId = paper.paper_id;

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        setPages(prev => prev.map((pg, idx) => (idx === i ? { ...pg, uploading: true } : pg)));
        try {
          await paperService.uploadPage(examId, paper.paper_id, p.pageNumber, p.file as File, token);
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
      const result = await paperService.grade(examId, paperId as number, token);
      setGradeResult({ correct: result.correct, total: result.total_items, pct: result.score_percent, warning: result.warning });
    } catch (e: unknown) {
      setGradeResult(null);
      setGradeError(e instanceof Error ? e.message : "Checking failed.");
    }
    setStep("done");
    onSuccess();
  };

  const busy = step === "uploading" || step === "grading";

  return (
    <Modal title="Add Paper" onClose={busy ? () => {} : onClose}>
      {step === "form" && (
        <>
          <label className="form-label" htmlFor="student-name">
            Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <input id="student-name" className="form-input" value={studentName}
            onChange={e => { setStudentName(e.target.value); setNameError(null); }}
            placeholder="e.g. Tablizo, Eric" aria-required="true" aria-invalid={!!nameError}
            style={nameError ? { borderBottomColor: "var(--error)" } : undefined} />
          {nameError && (
            <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem" }}>
              {nameError}
            </p>
          )}

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
                        <input type="file" accept="image/*" style={{ display: "none" }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(idx, f); }} />
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
              <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--navy)", marginBottom: "0.3rem" }}>
                {gradeResult.correct} / {gradeResult.total} correct
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: gradeResult.warning ? "0.6rem" : "1.25rem" }}>
                Score: <strong style={{ color: "var(--orange)" }}>{gradeResult.pct}%</strong>
              </p>
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