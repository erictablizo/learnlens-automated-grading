"use client";

import { useState, useRef, useEffect } from "react";

interface AddEditPaperModalProps {
  examId: number;
  onClose: () => void;
  onSaved: () => void;
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function CloudUpIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

function TrashSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

export default function AddEditPaperModal({ examId, onClose, onSaved }: AddEditPaperModalProps) {
  const [paperName, setPaperName] = useState("");
  const [files, setFiles]         = useState<File[]>([]);
  const [previews, setPreviews]   = useState<string[]>([]);
  const [isSaving, setIsSaving]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [fieldError, setFieldError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // HCI: User control — close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const arr = Array.from(fl).filter((f) => f.type.startsWith("image/"));
    setFiles((p) => [...p, ...arr]);
    setPreviews((p) => [...p, ...arr.map((f) => URL.createObjectURL(f))]);
  };

  const removeFile = (i: number) => {
    setFiles((p) => p.filter((_, j) => j !== i));
    setPreviews((p) => p.filter((_, j) => j !== i));
  };

  const handleSave = async () => {
    setError(null);
    // HCI: Error prevention — validate first
    if (!paperName.trim()) { setFieldError("Paper name is required."); return; }
    if (files.length === 0) { setError("Please upload at least one page image."); return; }
    setIsSaving(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("ll_access_token") : null;
      const form = new FormData();
      form.append("name", paperName.trim());
      files.forEach((f, i) => form.append(`page_${i + 1}`, f));
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/exams/${examId}/papers`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
      );
      onSaved();
      onClose();
    } catch {
      setError("Failed to upload paper. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="aep-title">

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title" id="aep-title">Add Test Paper</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <XIcon />
          </button>
        </div>

        {/* HCI: Informative feedback — error displayed immediately */}
        {error && (
          <div className="alert alert-error" role="alert" aria-live="polite" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Paper name */}
        <div className="ce-field">
          <label className="ce-label" htmlFor="aep-name">Paper Name</label>
          <input
            id="aep-name"
            className="ce-input"
            style={{ maxWidth: "100%" }}
            type="text"
            value={paperName}
            onChange={(e) => { setPaperName(e.target.value); setFieldError(""); }}
            placeholder="e.g. Student 1"
            autoFocus
            aria-describedby={fieldError ? "aep-name-err" : undefined}
          />
          {fieldError && <span id="aep-name-err" className="form-error" role="alert">{fieldError}</span>}
        </div>

        {/* Drop zone — HCI: direct manipulation */}
        <div
          className="modal-dropzone"
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Click or drag to upload page images"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
            aria-hidden="true"
          />
          <CloudUpIcon />
          <p className="modal-dz-text"><strong>Click to upload</strong> or drag and drop</p>
          <p className="modal-dz-hint">PNG, JPG, WEBP — one image per page</p>
        </div>

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="modal-previews" aria-label={`${previews.length} page(s) selected`}>
            {previews.map((src, i) => (
              <div key={i} className="modal-preview-item">
                <img src={src} alt={`Page ${i + 1}`} className="modal-preview-img" />
                <span className="modal-preview-label">Pg {i + 1}</span>
                <button
                  className="modal-preview-rm"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove page ${i + 1}`}
                >
                  <TrashSmIcon />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button className="ce-btn ce-btn--cancel" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="ce-btn ce-btn--save" onClick={handleSave} disabled={isSaving} aria-busy={isSaving}>
            {isSaving
              ? <span className="cef-spinner" style={{ borderTopColor: "#444", borderColor: "rgba(0,0,0,0.1)" }} />
              : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}