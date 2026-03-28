"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────────────
interface PageRow {
  id: string;
  pageNumber: number;
  file: File | null;
  preview: string | null;
}

// ── Icons ───────────────────────────────────────────────────────────────────
function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function TrashSmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Component ────────────────────────────────────────────────────────────────
export default function CreateExamForm() {
  const router = useRouter();

  const [examName, setExamName]       = useState("");
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount]     = useState(1);
  const [pagesOpen, setPagesOpen]     = useState(false);
  const [rows, setRows]               = useState<PageRow[]>([
    { id: uid(), pageNumber: 1, file: null, preview: null },
  ]);
  const [isSaving, setIsSaving]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // HCI: Recognition — clear options, no memorisation needed
  const PAGE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

  const handlePageCount = (n: number) => {
    setPageCount(n);
    setPagesOpen(false);
    setRows((prev) => {
      const next: PageRow[] = [];
      for (let i = 1; i <= n; i++) {
        const ex = prev.find((r) => r.pageNumber === i);
        next.push(ex ?? { id: uid(), pageNumber: i, file: null, preview: null });
      }
      return next;
    });
  };

  const handleFile = (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setRows((p) => p.map((r) => r.id === rowId ? { ...r, file: f, preview: URL.createObjectURL(f) } : r));
  };

  const removeFile = (rowId: string) => {
    setRows((p) => p.map((r) => r.id === rowId ? { ...r, file: null, preview: null } : r));
    if (fileRefs.current[rowId]) fileRefs.current[rowId]!.value = "";
  };

  // HCI: Error prevention — validate before API call
  const validate = () => {
    const e: Record<string, string> = {};
    if (!examName.trim())                  e.examName    = "Exam name is required.";
    else if (examName.trim().length < 7)   e.examName    = "Must be at least 7 characters.";
    if (!description.trim())               e.description = "Description is required.";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
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
      // HCI: Informative feedback — tell user what went wrong
      setError(err instanceof ApiError ? err.message : "Failed to save exam. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="cef-root">
      {/* HCI: Visibility of system status — error shown immediately at top */}
      {error && (
        <div className="alert alert-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <h1 className="cef-title">Create Exam</h1>

      {/* ── Exam Name ─────────────────────────────────────────────── */}
      <div className="cef-field">
        <label className="cef-label" htmlFor="cef-examName">Exam Name</label>
        <input
          id="cef-examName"
          className={`cef-input${fieldErrors.examName ? " cef-input--err" : ""}`}
          type="text"
          value={examName}
          onChange={(e) => { setExamName(e.target.value); setFieldErrors((p) => ({ ...p, examName: "" })); }}
          autoComplete="off"
          aria-describedby={fieldErrors.examName ? "cef-examName-err" : undefined}
        />
        {fieldErrors.examName && (
          <span id="cef-examName-err" className="cef-field-error" role="alert">{fieldErrors.examName}</span>
        )}
      </div>

      {/* ── Description ────────────────────────────────────────────── */}
      <div className="cef-field">
        <label className="cef-label" htmlFor="cef-desc">Description</label>
        <input
          id="cef-desc"
          className={`cef-input${fieldErrors.description ? " cef-input--err" : ""}`}
          type="text"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setFieldErrors((p) => ({ ...p, description: "" })); }}
          autoComplete="off"
          aria-describedby={fieldErrors.description ? "cef-desc-err" : undefined}
        />
        {fieldErrors.description && (
          <span id="cef-desc-err" className="cef-field-error" role="alert">{fieldErrors.description}</span>
        )}
      </div>

      {/* ── Answer Key section ──────────────────────────────────────── */}
      <p className="cef-section-heading">Answer Key</p>

      {/* ── Pages dropdown ─────────────────────────────────────────── */}
      <div className="cef-pages-row">
        <span className="cef-label">Pages</span>
        <div className="cef-dd-wrap">
          <button
            type="button"
            className="cef-dd-trigger"
            onClick={() => setPagesOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={pagesOpen}
            aria-label={`Pages: ${pageCount}. Click to change`}
          >
            {pageCount} <ChevronDownIcon />
          </button>
          {pagesOpen && (
            <ul className="cef-dd-list" role="listbox" aria-label="Number of pages">
              {PAGE_OPTIONS.map((n) => (
                <li
                  key={n}
                  role="option"
                  aria-selected={n === pageCount}
                  className={`cef-dd-item${n === pageCount ? " cef-dd-item--active" : ""}`}
                  onClick={() => handlePageCount(n)}
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Page / Image table ─────────────────────────────────────── */}
      <div className="cef-table-card">
        <table className="cef-table" aria-label="Exam answer key pages">
          <thead>
            <tr>
              <th className="cef-th cef-th--page">Page</th>
              <th className="cef-th">Image</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cef-tr">
                <td className="cef-td cef-td--page">{row.pageNumber}</td>
                <td className="cef-td">
                  {row.preview ? (
                    <div className="cef-preview">
                      <img src={row.preview} alt={`Page ${row.pageNumber} preview`} className="cef-preview-img" />
                      <button
                        type="button"
                        className="cef-remove-btn"
                        onClick={() => removeFile(row.id)}
                        aria-label={`Remove image for page ${row.pageNumber}`}
                        title="Remove"
                      >
                        <TrashSmIcon />
                      </button>
                    </div>
                  ) : (
                    <label className="cef-upload-area">
                      <input
                        ref={(el) => { fileRefs.current[row.id] = el; }}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleFile(row.id, e)}
                        aria-label={`Upload image for page ${row.pageNumber}`}
                      />
                      <span className="cef-upload-pill">
                        <UploadIcon /> Choose image
                      </span>
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Save / Cancel ──────────────────────────────────── */}
      {/* HCI: Closure — buttons give clear end-of-task signals */}
      <div className="cef-footer">
        <button
          type="button"
          className="cef-btn cef-btn--save"
          onClick={handleSave}
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {/* HCI: Visibility of system status — spinner while saving */}
          {isSaving
            ? <span className="cef-spinner" aria-label="Saving…" />
            : "Save"}
        </button>
        <button
          type="button"
          className="cef-btn cef-btn--cancel"
          onClick={() => router.push("/exams")}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}