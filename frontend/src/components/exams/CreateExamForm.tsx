"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import Button from "@/components/ui/Button";
import { useExams } from "@/hooks/useExams";
import { getToken } from "@/lib/auth";
import { examService } from "@/services/examService";
 
interface PageRow { pageNumber: number; file: File | null; }
 
export default function CreateExamForm() {
  const router = useRouter();
  const { createExam, isLoading, error } = useExams();
  const [examName, setExamName] = useState("");
  const [description, setDescription] = useState("");
  const [pages, setPages] = useState<PageRow[]>([{ pageNumber: 1, file: null }]);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
 
  const addPage = () => setPages(prev => [...prev, { pageNumber: prev.length + 1, file: null }]);
  const setPageFile = (idx: number, file: File) =>
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, file } : p));
 
  const handleSave = async () => {
    setSubmitError(null);
    if (!examName.trim()) { setSubmitError("Exam Name is required."); return; }
    if (examName.trim().length < 7) { setSubmitError("Exam name must be at least 7 characters."); return; }
 
    setSaving(true);
    try {
      const exam = await createExam({ exam_name: examName.trim(), description: description.trim() });
      if (!exam) { setSaving(false); return; }
 
      // Upload any attached pages
      const token = getToken();
      if (token) {
        for (const p of pages) {
          if (p.file) await examService.uploadPage(exam.exam_id, p.pageNumber, p.file, token);
        }
      }
      router.push(`/exams/${exam.exam_id}`);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Failed to save exam");
    } finally { setSaving(false); }
  };
 
  const handleCancel = () => router.push("/exams");
 
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h1 className="page-title" style={{ marginBottom: "1.5rem" }}>Create Exam</h1>
 
      <div className="create-exam-form">
        {(submitError || error) && (
          <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {submitError || error}
          </div>
        )}
 
        <label className="form-label" htmlFor="exam-name">Exam Name</label>
        <input
          id="exam-name"
          className="form-input"
          value={examName}
          onChange={e => setExamName(e.target.value)}
          placeholder="e.g. Long Exam 1"
          aria-required="true"
          disabled={saving}
        />
 
        <label className="form-label" htmlFor="exam-desc">Description</label>
        <input
          id="exam-desc"
          className="form-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description"
          disabled={saving}
        />
 
        {/* Answer Key section header */}
        <p className="form-label" style={{ marginBottom: "0.75rem" }}>Answer Key</p>
 
        {/* Pages collapsible section */}
        <div style={{ marginBottom: "1.25rem" }}>
          <button
            type="button"
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              background: "none", border: "none", cursor: "pointer",
              color: "var(--orange)", fontWeight: 600, fontSize: "0.9rem", padding: 0,
            }}
            onClick={() => setPagesOpen(o => !o)}
            aria-expanded={pagesOpen}
          >
            <span className="form-label" style={{ marginBottom: 0, cursor: "pointer" }}>Pages</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.5}
              style={{ transform: pagesOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
 
          {/* Pages table always visible (dropdown just toggles the upload zone) */}
          <div className="table-wrapper" style={{ marginTop: "0.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Image</th>
                </tr>
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
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                          {p.file ? p.file.name : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
 
          {pagesOpen && (
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}
              onClick={addPage}
            >
              + Add page
            </button>
          )}
        </div>
 
        {/* Save / Cancel row */}
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