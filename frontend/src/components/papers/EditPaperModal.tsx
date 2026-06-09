"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Paper } from "@/types/paper";
import { paperService } from "@/services/paperService";
import { getToken } from "@/lib/auth";
 
interface ExistingPage {
  paper_page_id: number;
  page_number:   number;
  image_path:    string;
  file:          File | null;   // null = keep existing
  removed:       boolean;       // true = user removed it
}
 
interface Props {
  paper:     Paper;
  examId:    number;
  onClose:   () => void;
  onSuccess: (msg: string) => void;
}
 
// ── Confirmation dialog for already-checked papers ────────────────────────────
function ConfirmDialog({
  onYes, onNo,
}: { onYes: () => void; onNo: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(10,20,40,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1100, backdropFilter: "blur(2px)",
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
    >
      <div style={{
        background: "var(--surface)", borderRadius: "var(--radius)",
        padding: "2rem", maxWidth: 400, width: "90%",
        boxShadow: "var(--shadow-lg)",
      }}>
        <p id="confirm-title" style={{ fontWeight: 600, color: "var(--navy)", marginBottom: "0.6rem", fontSize: "1rem" }}>
          Are you sure you want to continue?
        </p>
        <p id="confirm-desc" style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
          You are about to make changes to a test paper that has already been checked.
          Proceeding will reset the score of this entry.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Button variant="secondary" onClick={onNo}>No</Button>
          <Button variant="primary" onClick={onYes} style={{ width: "auto", padding: "0.6rem 1.5rem" }}>
            Yes
          </Button>
        </div>
      </div>
    </div>
  );
}
 
// ── Main EditPaperModal ───────────────────────────────────────────────────────
export default function EditPaperModal({ paper, examId, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"confirm" | "form">(
    paper.checked ? "confirm" : "form"
  );
 
  const [studentName, setStudentName] = useState(paper.student_name);
  const [pages,       setPages]       = useState<ExistingPage[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
 
  // Initialise page list from existing paper pages
  useEffect(() => {
    const existing: ExistingPage[] = (paper.paper_pages ?? []).map(pp => ({
      paper_page_id: pp.paper_page_id,
      page_number:   pp.page_number,
      image_path:    pp.image_path,
      file:          null,
      removed:       false,
    }));
    setPages(existing);
  }, [paper]);
 
  // Page count dropdown — can add pages
  const pageCount = pages.filter(p => !p.removed).length;
 
  const handlePageCountChange = (n: number) => {
    const current = pages.filter(p => !p.removed);
    if (n > current.length) {
      // Add blank new pages
      const newPages: ExistingPage[] = Array.from(
        { length: n - current.length },
        (_, i) => ({
          paper_page_id: -(Date.now() + i), // negative = new (not in DB)
          page_number:   current.length + i + 1,
          image_path:    "",
          file:          null,
          removed:       false,
        })
      );
      setPages(prev => [...prev.filter(p => !p.removed), ...newPages]);
    } else if (n < current.length) {
      // Mark last N pages as removed
      const toRemove = current.length - n;
      const ids = current.slice(-toRemove).map(p => p.paper_page_id);
      setPages(prev => prev.map(p =>
        ids.includes(p.paper_page_id) ? { ...p, removed: true } : p
      ));
    }
  };
 
  const handleRemovePage = (id: number) => {
    setPages(prev => prev.map(p =>
      p.paper_page_id === id ? { ...p, removed: true, file: null } : p
    ));
  };
 
  const handleFileSelect = (id: number, file: File) => {
    setPages(prev => prev.map(p =>
      p.paper_page_id === id ? { ...p, file } : p
    ));
  };
 
  const handleSave = async () => {
    setError(null);
    if (!studentName.trim()) { setError("Student name is required."); return; }
 
    const token = getToken();
    if (!token) return;
    setSaving(true);
 
    try {
      // 1. Update student name
      await paperService.updateName(examId, paper.paper_id, studentName.trim(), token);
 
      // 2. Delete removed pages
      const removed = pages.filter(p => p.removed && p.paper_page_id > 0);
      for (const pg of removed) {
        await paperService.deletePage(examId, paper.paper_id, pg.paper_page_id, token);
      }
 
      // 3. Upload new/replacement pages
      const active = pages.filter(p => !p.removed);
      for (const pg of active) {
        if (pg.file) {
          await paperService.uploadPage(examId, paper.paper_id, pg.page_number, pg.file, token);
        }
      }
 
      // 4. If paper was already checked, reset score
      if (paper.checked) {
        await paperService.resetScore(examId, paper.paper_id, token);
      }
 
      onSuccess("Paper updated successfully.");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong while updating the paper. Please try again.");
    } finally {
      setSaving(false);
    }
  };
 
  // ── Confirmation step (already-checked papers) ──────────────────────────────
  if (step === "confirm") {
    return (
      <ConfirmDialog
        onYes={() => setStep("form")}
        onNo={onClose}
      />
    );
  }
 
  // ── Edit form ────────────────────────────────────────────────────────────────
  const activePages = pages.filter(p => !p.removed);
 
  return (
    <Modal title="Edit Paper" onClose={onClose}>
      {error && (
        <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
 
      {/* Name */}
      <label className="form-label" htmlFor="edit-name">Name</label>
      <input
        id="edit-name"
        className="form-input"
        value={studentName}
        onChange={e => setStudentName(e.target.value)}
        aria-required="true"
        disabled={saving}
      />
 
      {/* Page count */}
      <div style={{ marginBottom: "1rem" }}>
        <label className="form-label" htmlFor="edit-page-count">Pages</label>
        <select
          id="edit-page-count"
          className="dropdown"
          value={activePages.length}
          onChange={e => handlePageCountChange(Number(e.target.value))}
          style={{ width: "80px" }}
          disabled={saving}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
 
      {/* Pages table */}
      <div className="table-wrapper" style={{ marginBottom: "1.25rem" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Page</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody>
            {activePages.map(pg => {
              const isNew      = pg.paper_page_id < 0;
              const hasExisting = !isNew && pg.image_path;
              const filename   = pg.file
                ? pg.file.name
                : hasExisting
                ? pg.image_path.split(/[/\\]/).pop() ?? ""
                : "";
 
              return (
                <tr key={pg.paper_page_id}>
                  <td>{pg.page_number}</td>
                  <td>
                    {hasExisting && !pg.file ? (
                      /* Existing image — show filename + remove button */
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--navy)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {filename}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePage(pg.paper_page_id)}
                          aria-label={`Remove page ${pg.page_number}`}
                          style={{
                            background: "none", border: "none",
                            color: "var(--error)", cursor: "pointer",
                            fontSize: "1rem", lineHeight: 1, padding: "0 0.1rem",
                          }}
                          disabled={saving}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      /* New upload or replaced */
                      <label style={{
                        display: "inline-flex", alignItems: "center", gap: "0.5rem",
                        cursor: "pointer",
                        background: pg.file ? "var(--orange-light)" : "var(--navy)",
                        color: pg.file ? "var(--orange)" : "#fff",
                        border: pg.file ? "1px solid var(--orange)" : "none",
                        borderRadius: "6px",
                        padding: "0.35rem 0.8rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                      }}>
                        {pg.file
                          ? `✓ ${pg.file.name.slice(0, 20)}${pg.file.name.length > 20 ? "…" : ""}`
                          : `Upload Page ${pg.page_number}`}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleFileSelect(pg.paper_page_id, f);
                          }}
                          disabled={saving}
                        />
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
 
      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          style={{ width: "auto", padding: "0.65rem 1.5rem" }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}