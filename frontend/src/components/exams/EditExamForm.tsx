"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { getToken } from "@/lib/auth";
import { examService } from "@/services/examService";
import { Exam, ExamPage } from "@/types/exam";
 
interface PageRow {
  pageNumber: number;
  pageId:     number | null;
  imagePath:  string | null;
  file:       File | null;
  removed:    boolean;
}
 
interface Props {
  examId: number;
}
 
export default function EditExamForm({ examId }: Props) {
  const router = useRouter();
 
  const [exam,      setExam]      = useState<Exam | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
 
  const [examName,    setExamName]    = useState("");
  const [description, setDescription] = useState("");
  const [pages,        setPages]      = useState<PageRow[]>([]);
 
  const [nameError, setNameError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
 
  const [saving, setSaving] = useState(false);
 
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
        setPages(
          existingPages.length > 0
            ? existingPages.map(p => ({
                pageNumber: p.page_number,
                pageId:     p.page_id,
                imagePath:  p.image_path,
                file:       null,
                removed:    false,
              }))
            : [{ pageNumber: 1, pageId: null, imagePath: null, file: null, removed: false }]
        );
      } catch {
        setLoadError("Could not load this exam.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [examId, router]);
 
  const setPageFile = (idx: number, file: File) =>
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, file } : p)));
 
  const removePage = (idx: number) =>
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, removed: true, file: null, imagePath: null } : p)));
 
  // ── Validation (matches Image 6 - field-level errors) ────────────────────────
  const validate = (): boolean => {
    let ok = true;
    setNameError(null);
    setDescError(null);
    setFormError(null);
 
    if (!examName.trim() || examName.trim().length < 7) {
      setNameError("Exam name must be at least 7 characters long.");
      ok = false;
    }
    if (!description.trim()) {
      setDescError("Description is required.");
      ok = false;
    }
    if (!ok) {
      setFormError("Some fields require your attention.");
    }
    return ok;
  };
 
  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
 
    setSaving(true);
    setFormError(null);
    const token = getToken();
    if (!token) { setSaving(false); return; }
 
    try {
      await examService.update(examId, { exam_name: examName.trim(), description: description.trim() }, token);
 
      const removed = pages.filter(p => p.removed && p.pageId !== null);
      for (const p of removed) {
        if (p.pageId) await examService.deletePage(examId, p.pageId, token);
      }
 
      const active = pages.filter(p => !p.removed);
      for (const p of active) {
        if (p.file) await examService.uploadPage(examId, p.pageNumber, p.file, token);
      }
 
      // Redirect to Manage Exams with success flag
      router.push("/exams?updated=1");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Something went wrong while updating the exam. Please try again.");
    } finally {
      setSaving(false);
    }
  };
 
  const handleCancel = () => router.push("/exams");
 
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
        {/* Exam Name */}
        <label className="form-label" htmlFor="exam-name">Exam Name</label>
        <input
          id="exam-name"
          className="form-input"
          value={examName}
          onChange={e => { setExamName(e.target.value); setNameError(null); }}
          aria-required="true"
          aria-invalid={!!nameError}
          disabled={saving}
          style={nameError ? { borderBottomColor: "var(--error)" } : undefined}
        />
        {nameError && (
          <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem" }}>
            {nameError}
          </p>
        )}
 
        {/* Description */}
        <label className="form-label" htmlFor="exam-desc">Description</label>
        <textarea
          id="exam-desc"
          className="form-input"
          value={description}
          onChange={e => { setDescription(e.target.value); setDescError(null); }}
          aria-required="true"
          aria-invalid={!!descError}
          disabled={saving}
          rows={3}
          style={{
            resize: "vertical",
            fontFamily: "var(--font-body)",
            ...(descError ? { borderBottomColor: "var(--error)" } : {}),
          }}
        />
        {descError && (
          <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem" }}>
            {descError}
          </p>
        )}
 
        {/* Answer Key / Pages section */}
        <p className="form-label" style={{ marginBottom: "0.5rem" }}>Answer Key</p>
        <div style={{ marginBottom: "1rem" }}>
          <label className="form-label" htmlFor="page-count" style={{ fontSize: "0.78rem" }}>Pages</label>
          <select
            id="page-count"
            className="dropdown"
            value={activePages.length}
            disabled
            style={{ width: "80px", opacity: 0.6 }}
          >
            <option>{activePages.length}</option>
          </select>
        </div>
 
        <div className="table-wrapper" style={{ marginBottom: "1.25rem" }}>
          <table>
            <thead>
              <tr><th style={{ width: 80 }}>Page</th><th>Image</th></tr>
            </thead>
            <tbody>
              {activePages.map((p) => {
                const realIdx = pages.indexOf(p);
                const filename = p.file
                  ? p.file.name
                  : p.imagePath
                  ? p.imagePath.split(/[/\\]/).pop()
                  : null;
 
                return (
                  <tr key={realIdx}>
                    <td>{p.pageNumber}</td>
                    <td>
                      {filename && !p.file ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#f4f8fb", border: "1px solid var(--border)", borderRadius: "50px", padding: "0.3rem 0.5rem 0.3rem 0.9rem" }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--navy)" }}>{filename}</span>
                          <button
                            type="button"
                            onClick={() => removePage(realIdx)}
                            aria-label={`Remove page ${p.pageNumber} image`}
                            style={{
                              width: 18, height: 18, borderRadius: "50%",
                              background: "var(--border)", border: "none",
                              color: "var(--text-muted)", cursor: "pointer",
                              fontSize: "0.7rem", lineHeight: 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                            disabled={saving}
                          >✕</button>
                        </div>
                      ) : (
                        <label style={{
                          display: "inline-flex", alignItems: "center", gap: "0.5rem",
                          cursor: "pointer",
                          background: p.file ? "var(--orange-light)" : "var(--navy)",
                          color: p.file ? "var(--orange)" : "#fff",
                          border: p.file ? "1px solid var(--orange)" : "none",
                          borderRadius: "6px",
                          padding: "0.4rem 0.9rem",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                        }}>
                          {p.file ? `✓ ${p.file.name.slice(0, 22)}${p.file.name.length > 22 ? "…" : ""}` : `Upload Page ${p.pageNumber}`}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) setPageFile(realIdx, f); }}
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
 
        {/* Form-level error (Image 6 bottom banner) */}
        {formError && (
          <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {formError}
          </div>
        )}
 
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <Button variant="primary" onClick={handleSave} loading={saving} style={{ width: "auto", padding: "0.65rem 1.75rem" }}>
            Save
          </Button>
          <Button variant="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}