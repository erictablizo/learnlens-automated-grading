"use client";
 
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
 
interface PageRow {
  id: string;
  pageNumber: number;
  file: File | null;
  preview: string | null;
}
 
function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
 
function TrashSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
 
function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
 
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
 
export default function CreateExamForm() {
  const router = useRouter();
 
  const [examName, setExamName] = useState("");
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [rows, setRows] = useState<PageRow[]>([
    { id: uid(), pageNumber: 1, file: null, preview: null },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
 
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
 
  const PAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 
  const handlePageCountChange = (count: number) => {
    setPageCount(count);
    setPagesOpen(false);
    setRows((prev) => {
      const next: PageRow[] = [];
      for (let i = 1; i <= count; i++) {
        const existing = prev.find((r) => r.pageNumber === i);
        next.push(existing ?? { id: uid(), pageNumber: i, file: null, preview: null });
      }
      return next;
    });
  };
 
  const handleFileChange = (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, file, preview } : r))
    );
  };
 
  const handleRemoveFile = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, file: null, preview: null } : r))
    );
    if (fileRefs.current[rowId]) fileRefs.current[rowId]!.value = "";
  };
 
  const validate = () => {
    const errors: Record<string, string> = {};
    if (!examName.trim()) errors.examName = "Exam name is required.";
    else if (examName.trim().length < 7) errors.examName = "Exam name must be at least 7 characters.";
    if (!description.trim()) errors.description = "Description is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
 
  const handleSave = async () => {
    setError(null);
    if (!validate()) return;
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    setIsSaving(true);
    try {
      const exam = await api.post<{ exam_id: number }>(
        "/exams",
        { exam_name: examName.trim(), description: description.trim() },
        token,
      );
      for (const row of rows) {
        if (!row.file) continue;
        const form = new FormData();
        form.append("page_number", String(row.pageNumber));
        form.append("image", row.file);
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/exams/${exam.exam_id}/pages`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
        );
      }
      router.push("/exams");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
 
  return (
    <div className="create-exam-wrapper">
      <h1 className="create-exam-title">Create Exam</h1>
 
      {error && (
        <div className="alert alert-error" role="alert" aria-live="polite"
          style={{ maxWidth: 520, margin: "0 auto 20px" }}>
          {error}
        </div>
      )}
 
      <div className="create-exam-form">
 
        {/* Exam Name */}
        <div className="ce-field">
          <label className="ce-label" htmlFor="examName">Exam Name</label>
          <input
            id="examName"
            className="ce-input"
            type="text"
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            autoComplete="off"
          />
          {fieldErrors.examName && <span className="form-error">{fieldErrors.examName}</span>}
        </div>
 
        {/* Description */}
        <div className="ce-field">
          <label className="ce-label" htmlFor="description">Description</label>
          <input
            id="description"
            className="ce-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoComplete="off"
          />
          {fieldErrors.description && <span className="form-error">{fieldErrors.description}</span>}
        </div>
 
        {/* Answer Key heading */}
        <div className="ce-section-label">Answer Key</div>
 
        {/* Pages dropdown */}
        <div className="ce-field ce-field--row">
          <span className="ce-label" style={{ marginBottom: 0 }}>Pages</span>
          <div className="ce-dropdown-wrap">
            <button
              type="button"
              className="ce-dropdown-btn"
              onClick={() => setPagesOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={pagesOpen}
            >
              <span>{pageCount}</span>
              <ChevronDownIcon />
            </button>
            {pagesOpen && (
              <ul className="ce-dropdown-list" role="listbox">
                {PAGE_OPTIONS.map((n) => (
                  <li
                    key={n}
                    role="option"
                    aria-selected={n === pageCount}
                    className={`ce-dropdown-item${n === pageCount ? " selected" : ""}`}
                    onClick={() => handlePageCountChange(n)}
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
 
        {/* Pages table */}
        <div className="ce-table-wrap">
          <table className="ce-table">
            <thead>
              <tr>
                <th className="ce-th">Page</th>
                <th className="ce-th">Image</th>
                <th className="ce-th ce-th--action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="ce-tr">
                  <td className="ce-td ce-td--page">{row.pageNumber}</td>
                  <td className="ce-td ce-td--image">
                    {row.preview ? (
                      <div className="ce-preview-wrap">
                        <img src={row.preview} alt={`Page ${row.pageNumber}`} className="ce-preview-img" />
                        <button type="button" className="ce-remove-btn" onClick={() => handleRemoveFile(row.id)} title="Remove">
                          <TrashSmallIcon />
                        </button>
                      </div>
                    ) : (
                      <label className="ce-upload-label">
                        <input
                          ref={(el) => { fileRefs.current[row.id] = el; }}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleFileChange(row.id, e)}
                        />
                        <span className="ce-upload-btn">
                          <UploadIcon />
                          <span>Choose image</span>
                        </span>
                      </label>
                    )}
                  </td>
                  <td className="ce-td ce-td--action" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
 
        {/* Footer */}
        <div className="ce-footer">
          <button
            type="button"
            className="ce-btn ce-btn--save"
            onClick={handleSave}
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving
              ? <span className="spinner" style={{ borderTopColor:"#444", borderColor:"rgba(0,0,0,0.1)", width:14, height:14 }} />
              : "Save"}
          </button>
          <button
            type="button"
            className="ce-btn ce-btn--cancel"
            onClick={() => router.push("/exams")}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}