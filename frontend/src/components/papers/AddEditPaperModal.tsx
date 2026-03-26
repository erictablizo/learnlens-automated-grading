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

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

export default function AddEditPaperModal({ examId, onClose, onSaved }: AddEditPaperModalProps) {
  const [paperName, setPaperName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...arr]);
    const newPreviews = arr.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError(null);
    if (!paperName.trim()) { setError("Paper name is required."); return; }
    if (files.length === 0) { setError("Please upload at least one page image."); return; }
    setIsSaving(true);
    try {
      // POST /api/exams/{examId}/papers  (multipart)
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
    /* Backdrop */
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Add test paper">

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Add Test Paper</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        {error && (
          <div className="alert alert-error" role="alert" style={{ margin: "0 0 16px" }}>
            {error}
          </div>
        )}

        {/* Paper name */}
        <div className="ce-field">
          <label className="ce-label" htmlFor="paperName">Paper Name</label>
          <input
            id="paperName"
            className="ce-input"
            style={{ maxWidth: "100%" }}
            type="text"
            value={paperName}
            onChange={(e) => setPaperName(e.target.value)}
            placeholder="e.g. Student 1"
            autoFocus
          />
        </div>

        {/* Drop zone */}
        <div
          className="modal-dropzone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <UploadIcon />
          <p className="modal-dropzone-text">
            <strong>Click to upload</strong> or drag and drop
          </p>
          <p className="modal-dropzone-hint">PNG, JPG, WEBP — one image per page</p>
        </div>

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="modal-previews">
            {previews.map((src, i) => (
              <div key={i} className="modal-preview-item">
                <img src={src} alt={`Page ${i + 1}`} className="modal-preview-img" />
                <span className="modal-preview-label">Page {i + 1}</span>
                <button
                  className="modal-preview-remove"
                  onClick={() => removeFile(i)}
                  title="Remove"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button className="ce-btn ce-btn--cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="ce-btn ce-btn--save" onClick={handleSave} disabled={isSaving} aria-busy={isSaving}>
            {isSaving
              ? <span className="spinner" style={{ borderTopColor: "#444", borderColor: "rgba(0,0,0,0.1)", width: 14, height: 14 }} />
              : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}