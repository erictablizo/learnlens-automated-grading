"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { getToken } from "@/lib/auth";
import { examService } from "@/services/examService";
import { Exam, ExamPage } from "@/types/exam";
 
interface PageRow {
  pageNumber: number;
  pageId:     number | null;   // null = new page not yet saved
  imagePath:  string | null;   // existing image path, if any
  file:       File | null;     // new/replacement file
  removed:    boolean;
}
 
interface Props {
  examId: number;
}
 
export default function EditExamForm({ examId }: Props) {
  const router = useRouter();
 
  const [exam,        setExam]        = useState<Exam | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
 
  const [examName,    setExamName]    = useState("");
  const [description, setDescription] = useState("");
  const [pages,        setPages]      = useState<PageRow[]>([]);
  const [pagesOpen,    setPagesOpen]  = useState(false);
 
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving,       setSaving]     = useState(false);
 
  // Confirmation when pages change and an answer key already exists
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [pendingSave,       setPendingSave]      = useState(false);
 
  // ── Load exam ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      setLoading(true);
      try {
        const data = await examService.get(examId, token);
        setExam(data);
        setExamName(data.exam_name);
        setDescription(data.description ?? "");
 
        const existingPages: ExamPage[] = data.pages ?? [];
        if (existingPages.length > 0) {
          setPages(existingPages.map(p => ({
            pageNumber: p.page_number,
            pageId:     p.page_id,
            imagePath:  p.image_path,
            file:       null,
            removed:    false,
          })));
        } else {
          setPages([{ pageNumber: 1, pageId: null, imagePath: null, file: null, removed: false }]);
        }
      } catch {
        setLoadError("Could not load this exam.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [examId, router]);
 
  const hasAnswerKey = (exam?.answer_keys?.length ?? 0) > 0;
 
  const addPage = () =>
    setPages(prev => [
      ...prev,
      { pageNumber: prev.filter(p => !p.removed).length + 1, pageId: null, imagePath: null, file: null, removed: false },
    ]);
 
  const setPageFile = (idx: number, file: File) =>
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, file } : p)));
 
  const removePage = (idx: number) =>
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, removed: true, file: null } : p)));
 
  const pagesChanged = pages.some(p => p.file || p.removed);
 
  // ── Save flow ──────────────────────────────────────────────────────────────
  const handleSaveClick = () => {
    setSubmitError(null);
    if (!examName.trim()) { setSubmitError("Exam Name is required."); return; }
    if (examName.trim().length < 7) { setSubmitError("Exam name must be at least 7 characters."); return; }
 
    // Warn if pages are changing and an answer key already exists
    if (pagesChanged && hasAnswerKey) {
      setShowResetWarning(true);
      return;
    }
    doSave();
  };
 
  const doSave = async () => {
    setShowResetWarning(false);
    setSaving(true);
    const token = getToken();
    if (!token) { setSaving(false); return; }
 
    try {
      // 1. Update exam name/description
      await examService.update(examId, { exam_name: examName.trim(), description: description.trim() }, token);
 
      // 2. Remove deleted pages
      const removed = pages.filter(p => p.removed && p.pageId !== null);
      for (const p of removed) {
        if (p.pageId) await examService.deletePage(examId, p.pageId, token);
      }
 
      // 3. Upload new/replacement pages
      const active = pages.filter(p => !p.removed);
      for (const p of active) {
        if (p.file) await examService.uploadPage(examId, p.pageNumber, p.file, token);
      }
 
      router.push(`/exams/${examId}`);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Failed to update exam.");
    } finally {
      setSaving(false);
    }
  };
 
  const handleCancel = () => router.push(`/exams/${examId}`);
 
  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem" }}>
        <span className="spinner spinner-dark" />
        <span style={{ color: "var(--text-muted)" }}>Loading exam…</span>
      </div>
    );
  }
 
  if (loadError || !exam) {
    return (
      <div style={{ padding: "2rem" }}>
        <div className="alert alert-error" role="alert">{loadError ?? "Exam not found."}</div>
        <Button variant="secondary" onClick={() => router.push("/exams")}>← Back to Exams</Button>
      </div>
    );
  }
 
  const activePages = pages.filter(p => !p.removed);
 
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h1 className="page-title" style={{ marginBottom: "1.5rem" }}>Edit Exam</h1>
 
      <div className="create-exam-form">
        {submitError && (
          <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {submitError}
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
 
        {hasAnswerKey && (
          <div style={{
            background: "var(--orange-light)",
            border: "1px solid var(--orange)",
            borderRadius: "var(--radius-sm)",
            padding: "0.6rem 0.9rem",
            fontSize: "0.8rem",
            color: "var(--navy)",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            <span>⚠</span>
            <span>This exam already has a generated answer key. Changing pages will require regenerating it.</span>
          </div>
        )}
 
        <p className="form-label" style={{ marginBottom: "0.75rem" }}>Pages</p>
 
        <div style={{ marginBottom: "1.25rem" }}>
          <button
            type="button"
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              background: "none", border: "none", cursor: "pointer",
              color: "var(--orange)", fontWeight: 600, fontSize: "0.9rem", padding: 0, marginBottom: "0.5rem",
            }}
            onClick={() => setPagesOpen(o => !o)}
            aria-expanded={pagesOpen}
          >
            {pagesOpen ? "Hide page editor" : "Edit pages"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              style={{ transform: pagesOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
 
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th style={{ width: 80 }}>Page</th><th>Image</th></tr>
              </thead>
              <tbody>
                {activePages.length === 0 ? (
                  <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--text-muted)", padding: "1rem" }}>No pages yet.</td></tr>
                ) : activePages.map((p) => {
                  const realIdx = pages.indexOf(p);
                  const filename = p.file
                    ? p.file.name
                    : p.imagePath
                    ? p.imagePath.split(/[/\\]/).pop()
                    : null;
 
                  return (
                    <tr key={realIdx}>
                      <td>Page {p.pageNumber}</td>
                      <td>
                        {pagesOpen ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            {filename && !p.file ? (
                              <>
                                <span style={{ fontSize: "0.82rem", color: "var(--navy)" }}>{filename}</span>
                                <button
                                  type="button"
                                  onClick={() => removePage(realIdx)}
                                  aria-label={`Remove page ${p.pageNumber}`}
                                  style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer", fontSize: "1rem" }}
                                  disabled={saving}
                                >✕</button>
                              </>
                            ) : (
                              <FileUpload
                                label={p.file ? p.file.name : "Upload image…"}
                                onFile={f => setPageFile(realIdx, f)}
                              />
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{filename ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
 
          {pagesOpen && (
            <button type="button" className="btn-secondary" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }} onClick={addPage}>
              + Add page
            </button>
          )}
        </div>
 
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <Button variant="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveClick} loading={saving} style={{ width: "auto", padding: "0.65rem 1.5rem" }}>
            Save
          </Button>
        </div>
      </div>
 
      {showResetWarning && (
        <ConfirmDialog
          title="Update pages?"
          message="This exam already has a generated answer key. Changing the pages means the answer key may no longer match. You'll need to regenerate it afterward. Continue?"
          confirmLabel="Yes, continue"
          cancelLabel="Cancel"
          onConfirm={doSave}
          onCancel={() => setShowResetWarning(false)}
          dangerous
        />
      )}
    </div>
  );
}