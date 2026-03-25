"use client";
 
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
 
interface PageRow {
  id: number;
  pageNumber: number;
  file: File | null;
  preview: string | null;
}
 
export default function CreateExamForm() {
  const router = useRouter();
  const [examName, setExamName] = useState("");
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState<number>(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pages, setPages] = useState<PageRow[]>([
    { id: 1, pageNumber: 1, file: null, preview: null },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
 
  const PAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
 
  // When page count changes, rebuild the rows
  const handlePageCountSelect = (count: number) => {
    setPageCount(count);
    setDropdownOpen(false);
    setPages(
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        pageNumber: i + 1,
        file: pages[i]?.file ?? null,
        preview: pages[i]?.preview ?? null,
      }))
    );
  };
 
  const handleFileChange = (pageId: number, file: File | null) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, file, preview } : p))
    );
  };
 
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!examName.trim()) errs.examName = "Exam name is required.";
    else if (examName.trim().length < 7)
      errs.examName = "Exam name must be at least 7 characters.";
    if (!description.trim()) errs.description = "Description is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };
 
  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      // TODO: wire to POST /api/exams when backend exam routes are ready
      await new Promise((r) => setTimeout(r, 600));
      router.push("/exams");
    } finally {
      setIsSaving(false);
    }
  };
 
  const handleCancel = () => router.push("/exams");
 
  return (
    <div className="create-exam-wrapper">
      <h1 className="create-exam-title">Create Exam</h1>
 
      <div className="create-exam-form">
        {/* ── Exam Name ─────────────────────────────────────────── */}
        <div className="ce-field">
          <label className="ce-label" htmlFor="examName">
            Exam Name
          </label>
          <input
            id="examName"
            className={`ce-input${errors.examName ? " ce-input--error" : ""}`}
            type="text"
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            placeholder=""
            autoComplete="off"
          />
          {errors.examName && (
            <span className="ce-field-error">{errors.examName}</span>
          )}
        </div>
 
        {/* ── Description ───────────────────────────────────────── */}
        <div className="ce-field">
          <label className="ce-label" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            className={`ce-input${errors.description ? " ce-input--error" : ""}`}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder=""
            autoComplete="off"
          />
          {errors.description && (
            <span className="ce-field-error">{errors.description}</span>
          )}
        </div>
 
        {/* ── Answer Key section ────────────────────────────────── */}
        <div className="ce-section-header">Answer Key</div>
 
        {/* Pages dropdown */}
        <div className="ce-pages-row">
          <span className="ce-label" style={{ marginBottom: 0 }}>
            Pages
          </span>
          <div className="ce-dropdown-wrap">
            <button
              type="button"
              className="ce-dropdown-btn"
              onClick={() => setDropdownOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <span>{pageCount}</span>
              <ChevronIcon open={dropdownOpen} />
            </button>
            {dropdownOpen && (
              <ul className="ce-dropdown-list" role="listbox">
                {PAGE_OPTIONS.map((n) => (
                  <li
                    key={n}
                    role="option"
                    aria-selected={pageCount === n}
                    className={`ce-dropdown-item${pageCount === n ? " ce-dropdown-item--active" : ""}`}
                    onClick={() => handlePageCountSelect(n)}
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
 
        {/* ── Pages table ───────────────────────────────────────── */}
        <div className="ce-table-wrap">
          <table className="ce-table">
            <thead>
              <tr>
                <th className="ce-th">Page</th>
                <th className="ce-th">Image</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id} className="ce-tr">
                  <td className="ce-td ce-td--page">{page.pageNumber}</td>
                  <td className="ce-td">
                    <div className="ce-upload-cell">
                      {page.preview ? (
                        <div className="ce-preview-wrap">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={page.preview}
                            alt={`Page ${page.pageNumber} preview`}
                            className="ce-preview-img"
                          />
                          <button
                            type="button"
                            className="ce-replace-btn"
                            onClick={() =>
                              fileRefs.current[page.id]?.click()
                            }
                          >
                            Replace
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ce-upload-btn"
                          onClick={() => fileRefs.current[page.id]?.click()}
                          aria-label={`Upload image for page ${page.pageNumber}`}
                        >
                          <UploadIcon />
                          <span>Choose image</span>
                        </button>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        ref={(el) => {
                          fileRefs.current[page.id] = el;
                        }}
                        onChange={(e) =>
                          handleFileChange(
                            page.id,
                            e.target.files?.[0] ?? null
                          )
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
 
      {/* ── Action buttons ────────────────────────────────────── */}
      <div className="ce-actions">
        <button
          type="button"
          className="ce-btn ce-btn-save"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <span className="spinner spinner--sm" /> : "Save"}
        </button>
        <button
          type="button"
          className="ce-btn ce-btn-cancel"
          onClick={handleCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
 
/* ── Small icon components ──────────────────────────────────────────────── */
 
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
 
function UploadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}