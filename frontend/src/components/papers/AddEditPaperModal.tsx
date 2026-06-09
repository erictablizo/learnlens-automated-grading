"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
import { getToken } from "@/lib/auth";
import { PageUploadState } from "@/types/paper";
 
interface Props {
  examId:    number;
  examPages: number;          // number of pages the exam has (default 1)
  onClose:   () => void;
  onSuccess: () => void;
}
 
const MAX_PAGES = 10;
 
export default function AddEditPaperModal({ examId, examPages, onClose, onSuccess }: Props) {
  const [studentName,  setStudentName]  = useState("");
  const [pageCount,    setPageCount]    = useState(Math.max(1, examPages));
  const [pages,        setPages]        = useState<PageUploadState[]>(() =>
    Array.from({ length: Math.max(1, examPages) }, (_, i) => ({
      pageNumber: i + 1, file: null, uploaded: false, uploading: false, error: null,
    }))
  );
  const [step,         setStep]         = useState<"form" | "uploading" | "grading" | "done" | "error">("form");
  const [gradeResult,  setGradeResult]  = useState<{ correct: number; total: number; pct: number } | null>(null);
  const [globalError,  setGlobalError]  = useState<string | null>(null);
 
  // Update page list when count changes
  const handlePageCountChange = (n: number) => {
    setPageCount(n);
    setPages(Array.from({ length: n }, (_, i) => ({
      pageNumber: i + 1, file: null, uploaded: false, uploading: false, error: null,
    })));
  };
 
  const handleFileSelect = (idx: number, file: File) => {
    setPages(prev => prev.map((p, i) =>
      i === idx ? { ...p, file, error: null } : p
    ));
  };
 
  const handleSave = async () => {
    setGlobalError(null);
 
    // Client-side validation
    if (!studentName.trim()) { setGlobalError("Student name is required."); return; }
    const hasAnyFile = pages.some(p => p.file !== null);
    if (!hasAnyFile) { setGlobalError("Please upload at least one page image."); return; }
 
    const token = getToken();
    if (!token) return;
 
    setStep("uploading");
 
    try {
      // 1. Create the paper record
      const paper = await paperService.create(examId, studentName.trim(), token);
 
      // 2. Upload each page that has a file
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (!p.file) continue;
 
        setPages(prev => prev.map((pg, idx) =>
          idx === i ? { ...pg, uploading: true } : pg
        ));
 
        try {
          await paperService.uploadPage(examId, paper.paper_id, p.pageNumber, p.file, token);
          setPages(prev => prev.map((pg, idx) =>
            idx === i ? { ...pg, uploading: false, uploaded: true } : pg
          ));
        } catch {
          setPages(prev => prev.map((pg, idx) =>
            idx === i ? { ...pg, uploading: false, error: "Upload failed" } : pg
          ));
        }
      }
 
      // 3. Trigger OCR grading
      setStep("grading");
      try {
        const result = await paperService.grade(examId, paper.paper_id, token);
        setGradeResult({ correct: result.correct, total: result.total_items, pct: result.score_percent });
        setStep("done");
        onSuccess();
      } catch {
        // Grading failed but paper was saved — not fatal
        setStep("done");
        setGradeResult(null);
        onSuccess();
      }
 
    } catch (e: unknown) {
      setGlobalError(e instanceof Error ? e.message : "Something went wrong while adding the paper. Please try again.");
      setStep("error");
    }
  };
 
  const allUploaded = pages.every(p => !p.file || p.uploaded);
 
  return (
    <Modal title="Add Paper" onClose={onClose}>
 
      {/* ── Step: form ── */}
      {(step === "form" || step === "error") && (
        <>
          {globalError && (
            <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
              {globalError}
            </div>
          )}
 
          {/* Student name */}
          <label className="form-label" htmlFor="student-name">Name</label>
          <input
            id="student-name"
            className="form-input"
            value={studentName}
            onChange={e => setStudentName(e.target.value)}
            placeholder="e.g. Long Exam 1 – Tablizo, Eric"
            aria-required="true"
          />
 
          {/* Page count */}
          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label" htmlFor="page-count">Pages</label>
            <select
              id="page-count"
              className="dropdown"
              value={pageCount}
              onChange={e => handlePageCountChange(Number(e.target.value))}
              style={{ width: "80px" }}
            >
              {Array.from({ length: MAX_PAGES }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
 
          {/* Pages table */}
          <div className="table-wrapper" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>Page</th>
                  <th>Image</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p, idx) => (
                  <tr key={p.pageNumber}>
                    <td>{p.pageNumber}</td>
                    <td>
                      <label
                        style={{
                          display:       "inline-flex",
                          alignItems:    "center",
                          gap:           "0.5rem",
                          cursor:        "pointer",
                          background:    p.file ? "var(--orange-light)" : "var(--navy)",
                          color:         p.file ? "var(--orange)" : "#fff",
                          border:        p.file ? "1px solid var(--orange)" : "none",
                          borderRadius:  "6px",
                          padding:       "0.35rem 0.8rem",
                          fontSize:      "0.82rem",
                          fontWeight:    600,
                        }}
                      >
                        {p.file ? `✓ ${p.file.name.slice(0, 20)}…` : `Upload Page ${p.pageNumber}`}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleFileSelect(idx, f);
                          }}
                        />
                      </label>
                      {p.error && (
                        <span style={{ color: "var(--error)", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                          {p.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
 
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleSave}
              style={{ width: "auto", padding: "0.65rem 1.5rem" }}
            >
              Save
            </Button>
          </div>
        </>
      )}
 
      {/* ── Step: uploading ── */}
      {step === "uploading" && (
        <div style={{ padding: "1.5rem 0", textAlign: "center" }}>
          <div style={{ marginBottom: "1rem" }}>
            {pages.map(p => (
              p.file && (
                <div key={p.pageNumber} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", justifyContent: "center" }}>
                  {p.uploaded
                    ? <span style={{ color: "var(--success)", fontWeight: 600 }}>✓</span>
                    : p.uploading
                    ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} />
                    : <span style={{ color: "var(--text-muted)" }}>○</span>}
                  <span style={{ fontSize: "0.875rem", color: "var(--navy)" }}>
                    Page {p.pageNumber}
                  </span>
                </div>
              )
            ))}
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Uploading pages…</p>
        </div>
      )}
 
      {/* ── Step: grading ── */}
      {step === "grading" && (
        <div style={{ padding: "2rem 0", textAlign: "center" }}>
          <span className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Running OCR and grading…
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
            This may take a few seconds
          </p>
        </div>
      )}
 
      {/* ── Step: done ── */}
      {step === "done" && (
        <div style={{ padding: "1rem 0", textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
            {gradeResult ? "🎉" : "✅"}
          </div>
 
          {gradeResult ? (
            <>
              <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--navy)", marginBottom: "0.3rem" }}>
                {gradeResult.correct} / {gradeResult.total} correct
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                Score: <strong style={{ color: "var(--orange)" }}>{gradeResult.pct}%</strong>
              </p>
            </>
          ) : (
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
              Paper added successfully.<br />
              <span style={{ fontSize: "0.78rem" }}>Auto-grading was skipped — grade manually if needed.</span>
            </p>
          )}
 
          <Button variant="primary" onClick={onClose} style={{ width: "auto", padding: "0.65rem 1.75rem" }}>
            Done
          </Button>
        </div>
      )}
    </Modal>
  );
}