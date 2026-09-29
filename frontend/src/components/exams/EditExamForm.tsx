"use client";
/**
 * ENHANCEMENT 2026-09-29 — the Page and Image columns are editable.
 *
 * Built on your current file: the answer-key viewer below, the Save/Cancel
 * buttons and the field-level errors are unchanged, and no new component is
 * needed. What changed:
 *
 *  - PAGES: the count dropdown works now (it was disabled). Raising it adds a
 *    blank page, lowering it drops the last one(s).
 *  - PAGE NUMBER: each saved page has a dropdown 1..N. Picking a new number
 *    SWAPS it with the page that currently holds that number, so page numbers
 *    stay 1..N with no gaps and no duplicates. Nothing is sent until Save; the
 *    moves then go out in order (PUT /exams/{id}/pages/{pageId}). The answer
 *    key follows the new page order and checked papers are reset.
 *  - IMAGE: "Change" opens the file picker and swaps the image straight away;
 *    the old one is kept if you cancel.
 *  - ✕ now CLEARS the image instead of deleting the whole page, and a page
 *    with no image can no longer be saved (thesis p.5 observation). Use the
 *    Pages dropdown to actually remove a page.
 */
import ExamKeyViewer from "@/components/exams/ExamKeyViewer";
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

const MAX_PAGES = 10;
const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;
const isImage = (f: File) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
const byNumber = (a: PageRow, b: PageRow) => a.pageNumber - b.pageNumber;

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
  const [pageErrors, setPageErrors] = useState<Record<number, string>>({});

  const [saving, setSaving] = useState(false);

  const [regeneratingKey, setRegeneratingKey] = useState(false);

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

        const existingPages: ExamPage[] = (data.pages ?? [])
          .slice()
          .sort((a, b) => a.page_number - b.page_number);
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

  // ── Images ─────────────────────────────────────────────────────────────────
  const setPageFile = (idx: number, file: File) => {
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, file } : p)));
    setPageErrors(prev => {
      const next = { ...prev };
      if (isImage(file)) delete next[idx];
      else next[idx] = "Only image files (JPG, PNG) are allowed.";
      return next;
    });
  };

  // ✕ = remove this image. The page stays, so it still needs one before saving.
  const clearPageImage = (idx: number) =>
    setPages(prev => prev.map((p, i) => (i === idx ? { ...p, imagePath: null, file: null } : p)));

  // put the saved image back after ✕ or after picking the wrong file
  const restorePageImage = (idx: number) =>
    setPages(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const saved = (exam?.pages ?? []).find(sp => sp.page_id === p.pageId);
      return { ...p, file: null, imagePath: saved ? saved.image_path : p.imagePath };
    }));

  // ── Page numbers ───────────────────────────────────────────────────────────
  /** Give this row `next` and hand its old number to whoever holds `next`. */
  const movePage = (idx: number, next: number) => {
    setPages(prev => {
      const row = prev[idx];
      if (!row || row.removed || row.pageNumber === next) return prev;
      const current = row.pageNumber;
      return prev.map((p, i) => {
        if (i === idx) return { ...p, pageNumber: next };
        if (!p.removed && p.pageNumber === next) return { ...p, pageNumber: current };
        return p;
      });
    });
    setPageErrors({});
  };

  const setPageCount = (count: number) => {
    setPages(prev => {
      const active = prev.filter(p => !p.removed).sort(byNumber);
      if (count === active.length) return prev;

      if (count < active.length) {
        const drop = new Set(active.slice(count).map(p => p.pageNumber));
        return prev.map(p => (!p.removed && drop.has(p.pageNumber) ? { ...p, removed: true } : p));
      }

      const next = [...prev];
      for (let n = active.length + 1; n <= count; n++) {
        const reusable = next.findIndex(p => p.removed && p.pageNumber === n);
        if (reusable >= 0) next[reusable] = { ...next[reusable], removed: false, file: null };
        else next.push({ pageNumber: n, pageId: null, imagePath: null, file: null, removed: false });
      }
      return next;
    });
    setPageErrors({});
  };

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

    // NEW 2026-09-29: a page with no image can no longer be saved (p.5)
    const pErr: Record<number, string> = {};
    pages.forEach((p, i) => {
      if (p.removed) return;
      if (p.file && !isImage(p.file)) pErr[i] = "Only image files (JPG, PNG) are allowed.";
      else if (!p.file && !p.imagePath) pErr[i] = `Please upload an image for Page ${p.pageNumber}.`;
    });
    setPageErrors(pErr);
    if (Object.keys(pErr).length) ok = false;

    if (!ok) {
      setFormError("Some fields require your attention.");
    }
    return ok;
  };

  /**
   * NEW 2026-09-29: put the saved pages into the order the teacher chose. The
   * backend swaps, so filling positions 1, 2, 3 … in turn always lands every
   * page on its number. `serverPos` mirrors the server as each swap goes out.
   */
  const applyPageOrder = async (token: string) => {
    const serverPos = new Map<number, number>();
    (exam?.pages ?? []).forEach(p => serverPos.set(p.page_id, p.page_number));

    const wanted = pages.filter(p => !p.removed).sort(byNumber);
    for (let i = 0; i < wanted.length; i++) {
      const target = i + 1;
      const pageId = wanted[i].pageId;
      if (pageId === null) continue;                    // new page, uploaded below
      const from = serverPos.get(pageId);
      if (from === undefined || from === target) continue;

      await examService.updatePageNumber(examId, pageId, target, token);

      const displaced = Array.from(serverPos.entries())
        .find(([id, n]) => n === target && id !== pageId);
      serverPos.set(pageId, target);
      if (displaced) serverPos.set(displaced[0], from);
    }
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

      // 1. move pages to their new numbers first, so the uploads below land on
      //    the right page and the answer key is renumbered by the new order
      await applyPageOrder(token);

      // 2. upload new / replacement images
      for (const p of pages.filter(x => !x.removed).sort(byNumber)) {
        if (p.file) await examService.uploadPage(examId, p.pageNumber, p.file, token);
      }

      // 3. delete the pages dropped by the Pages count
      for (const p of pages) {
        if (p.removed && p.pageId !== null) await examService.deletePage(examId, p.pageId, token);
      }

      // Redirect to Manage Exams with success flag
      router.push("/exams?updated=1");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Something went wrong while updating the exam. Please try again.");
      const t = getToken();                        // re-sync: some moves may already have happened
      if (t) { try { setExam(await examService.get(examId, t)); } catch {} }
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

  const activePages  = pages.filter(p => !p.removed).sort(byNumber);
  const savedNumber  = (pageId: number | null) =>
    pageId === null ? null : (exam.pages ?? []).find(p => p.page_id === pageId)?.page_number ?? null;
  const orderChanged = pages.some(p => !p.removed && p.pageId !== null && savedNumber(p.pageId) !== p.pageNumber);
  const pendingChange = orderChanged || pages.some(p => p.file || (p.removed && p.pageId !== null));

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
            disabled={saving}
            onChange={e => setPageCount(Number(e.target.value))}
            style={{ width: "80px" }}
          >
            {Array.from({ length: MAX_PAGES }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="table-wrapper" style={{ marginBottom: "1.25rem" }}>
          <table>
            <thead>
              <tr><th style={{ width: 110 }}>Page</th><th>Image</th></tr>
            </thead>
            <tbody>
              {activePages.map((p) => {
                const realIdx = pages.indexOf(p);
                const serverName = p.imagePath ? p.imagePath.split(/[/\\]/).pop() : null;
                const saved = savedNumber(p.pageId);
                const moved = saved !== null && saved !== p.pageNumber;

                return (
                  <tr key={p.pageId ?? `new-${realIdx}`}>
                    <td>
                      {p.pageId === null ? (
                        <span>{p.pageNumber}</span>
                      ) : (
                        <>
                          <select
                            value={p.pageNumber}
                            disabled={saving}
                            aria-label={`Page number for the image currently on page ${saved}`}
                            onChange={e => movePage(realIdx, Number(e.target.value))}
                            style={{
                              width: "4.5rem", padding: "0.25rem", fontSize: "0.9rem",
                              border: "1px solid var(--border)", borderRadius: "6px",
                              background: moved ? "var(--orange-light)" : "#fff",
                              color: moved ? "var(--orange)" : "inherit",
                              fontWeight: moved ? 700 : 400,
                            }}
                          >
                            {activePages.map(o => (
                              <option key={o.pageNumber} value={o.pageNumber}>{o.pageNumber}</option>
                            ))}
                          </select>
                          {moved && (
                            <p style={{ fontSize: "0.72rem", color: "var(--orange)", margin: "0.2rem 0 0" }}>
                              was page {saved}
                            </p>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        {p.file ? (
                          <>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "var(--orange-light)", border: "1px solid var(--orange)", borderRadius: "50px", padding: "0.3rem 0.5rem 0.3rem 0.9rem" }}>
                              <span style={{ fontSize: "0.8rem", color: "var(--orange)" }}>
                                ✓ {p.file.name.slice(0, 22)}{p.file.name.length > 22 ? "…" : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => restorePageImage(realIdx)}
                                aria-label={`Undo the new image for page ${p.pageNumber}`}
                                title="Undo"
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
                            <label style={{
                              display: "inline-flex", alignItems: "center", cursor: saving ? "not-allowed" : "pointer",
                              background: "transparent", color: "var(--navy)",
                              border: "1px solid var(--border)", borderRadius: "6px",
                              padding: "0.4rem 0.9rem", fontSize: "0.82rem", fontWeight: 600,
                            }}>
                              Change
                              <input type="file" accept="image/*" style={{ display: "none" }} disabled={saving}
                                onChange={e => { const f = e.target.files?.[0]; if (f) setPageFile(realIdx, f); e.target.value = ""; }} />
                            </label>
                          </>
                        ) : serverName ? (
                          <>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#f4f8fb", border: "1px solid var(--border)", borderRadius: "50px", padding: "0.3rem 0.5rem 0.3rem 0.9rem" }}>
                              <span style={{ fontSize: "0.8rem", color: "var(--navy)" }}>{serverName}</span>
                              <button
                                type="button"
                                onClick={() => clearPageImage(realIdx)}
                                aria-label={`Remove the image on page ${p.pageNumber}`}
                                title="Remove image"
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
                            <label style={{
                              display: "inline-flex", alignItems: "center", cursor: saving ? "not-allowed" : "pointer",
                              background: "transparent", color: "var(--navy)",
                              border: "1px solid var(--border)", borderRadius: "6px",
                              padding: "0.4rem 0.9rem", fontSize: "0.82rem", fontWeight: 600,
                            }}>
                              Change
                              <input type="file" accept="image/*" style={{ display: "none" }} disabled={saving}
                                onChange={e => { const f = e.target.files?.[0]; if (f) setPageFile(realIdx, f); e.target.value = ""; }} />
                            </label>
                          </>
                        ) : (
                          <>
                            <label style={{
                              display: "inline-flex", alignItems: "center", gap: "0.5rem",
                              cursor: saving ? "not-allowed" : "pointer",
                              background: "var(--navy)", color: "#fff",
                              border: pageErrors[realIdx] ? "1px solid var(--error)" : "none",
                              borderRadius: "6px", padding: "0.4rem 0.9rem",
                              fontSize: "0.82rem", fontWeight: 600,
                            }}>
                              {`Upload Page ${p.pageNumber}`}
                              <input type="file" accept="image/*" style={{ display: "none" }} disabled={saving}
                                onChange={e => { const f = e.target.files?.[0]; if (f) setPageFile(realIdx, f); e.target.value = ""; }} />
                            </label>
                            {p.pageId !== null && (
                              <button type="button" onClick={() => restorePageImage(realIdx)} disabled={saving}
                                className="btn-secondary" style={{ fontSize: "0.78rem", padding: "0.35rem 0.8rem" }}>
                                Keep current image
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {pageErrors[realIdx] && (
                        <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
                          {pageErrors[realIdx]}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pendingChange && (
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "-0.75rem", marginBottom: "1rem" }}>
            {orderChanged
              ? "Changing a page number re-orders the answer key (question 1 becomes the first question of the new page 1) and resets checked papers."
              : "Changing a page image removes that page’s answer key and resets checked papers. Generate the key again after saving."}
          </p>
        )}

        {/* Form-level error (Image 6 bottom banner) */}
        {formError && (
          <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {formError}
          </div>
        )}

        {/* ── Answer Key Viewer ── */}
        {exam && exam.answer_keys && exam.answer_keys.length > 0 && (
          <div style={{
            marginTop: "2rem",
            paddingTop: "2rem",
            borderTop: "1px solid var(--border)"
          }}>
            <ExamKeyViewer
              answerKeys={exam.answer_keys}
              examId={examId}
              pageId={exam.pages?.[0]?.page_id ?? 0}
              onRegenerate={async () => {
                setRegeneratingKey(true);
                setFormError(null);
                try {
                  const token = getToken();
                  if (!token) {
                    setFormError("Session expired. Please login again.");
                    setRegeneratingKey(false);
                    return;
                  }
                  if (!exam.pages?.[0]) {
                    setFormError("No exam pages found. Upload an answer sheet first.");
                    setRegeneratingKey(false);
                    return;
                  }

                  const result = await examService.generateAnswerKey(
                    examId,
                    exam.pages[0].page_id,
                    token
                  );

                  if (!result.success) {
                    setFormError(`Generation failed: ${result.message}`);
                    setRegeneratingKey(false);
                    return;
                  }

                  const updated = await examService.get(examId, token);
                  setExam(updated);
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Unknown error";
                  setFormError(`Failed: ${msg}`);
                } finally {
                  setRegeneratingKey(false);
                }
              }}
              isRegenerating={regeneratingKey}
            />
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