"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PapersTable from "@/components/papers/PapersTable";
import AddEditPaperModal from "@/components/papers/AddEditPaperModal";
import EditPaperModal from "@/components/papers/EditPaperModal";
import { examService } from "@/services/examService";
import { paperService } from "@/services/paperService";
import { Exam } from "@/types/exam";
import { Paper } from "@/types/paper";
import { usePapers } from "@/hooks/usePapers";
import { getToken, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";
 
// ── icons ─────────────────────────────────────────────────────────────────────
const IconBack = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const IconLeft = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const IconRight = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
 
// ── helpers ───────────────────────────────────────────────────────────────────
const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");
 
function imgUrl(path: string): string {
  return `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
}
 
// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: "success" | "error"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        background: type === "success" ? "var(--success-bg)" : "var(--error-bg)",
        border: `1px solid ${type === "success" ? "#b2dfb2" : "#feb2b2"}`,
        color: type === "success" ? "var(--success)" : "var(--error)",
        borderRadius: "var(--radius-sm)", padding: "0.6rem 1.25rem",
        fontSize: "0.875rem", fontWeight: 500, zIndex: 9999,
        boxShadow: "var(--shadow)", display: "flex", alignItems: "center",
        gap: "0.5rem", whiteSpace: "nowrap",
      }}
    >
      {type === "success" ? "✓" : "⚠"} {msg}
    </div>
  );
}
 
// ── Main page ─────────────────────────────────────────────────────────────────
export default function ViewExamPage() {
  const params  = useParams();
  const router  = useRouter();
  const examId  = Number(params?.id ?? params?.exam_id ?? 0);
 
  // Exam
  const [exam,          setExam]          = useState<Exam | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
 
  // Page viewer
  const [pageIdx,     setPageIdx]     = useState(0);
  const [examImgErr,  setExamImgErr]  = useState(false);
  const [paperImgErr, setPaperImgErr] = useState(false);
 
  // Selected paper
  const [selectedPaper,     setSelectedPaper]     = useState<Paper | null>(null);
  const [selectedPaperFull, setSelectedPaperFull] = useState<Paper | null>(null);
  const [loadingPaper,      setLoadingPaper]       = useState(false);
 
  // Grading
  const [checking, setChecking] = useState(false);
 
  // Delete confirm dialog
  const [deletingPaper, setDeletingPaper] = useState<Paper | null>(null);
  const [deleting,      setDeleting]      = useState(false);
 
  // Modals
  const [showAddPaper, setShowAddPaper] = useState(false);
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
 
  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
 
  const { papers, fetchPapers, deletePaper } = usePapers(examId);
 
  // ── Load exam ─────────────────────────────────────────────────────────────
  const loadExam = useCallback(async () => {
    if (!examId) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true); setLoadError(null);
    try {
      const data = await examService.get(examId, token);
      setExam(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace("/login"); return; }
      setLoadError("Could not load exam.");
    } finally { setLoading(false); }
  }, [examId, router]);
 
  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    loadExam();
    fetchPapers();
  }, [loadExam, fetchPapers, router]);
 
  // ── Load full paper detail ────────────────────────────────────────────────
  const loadPaperDetail = useCallback(async (paper: Paper) => {
    setLoadingPaper(true); setPaperImgErr(false);
    const token = getToken();
    if (!token) { setLoadingPaper(false); return; }
    try {
      const full = await paperService.get(examId, paper.paper_id, token);
      setSelectedPaperFull(full);
    } catch {
      setSelectedPaperFull(null);
    } finally { setLoadingPaper(false); }
  }, [examId]);
 
  // ── Select paper row ──────────────────────────────────────────────────────
  const handleSelectPaper = useCallback(async (paper: Paper) => {
    if (selectedPaper?.paper_id === paper.paper_id) {
      setSelectedPaper(null); setSelectedPaperFull(null); return;
    }
    setSelectedPaper(paper); setSelectedPaperFull(null); setPageIdx(0);
    await loadPaperDetail(paper);
  }, [selectedPaper, loadPaperDetail]);
 
  // ── Edit paper ────────────────────────────────────────────────────────────
  const handleEditPaper = useCallback(async (paper: Paper) => {
    const token = getToken();
    if (!token) return;
    try {
      const full = await paperService.get(examId, paper.paper_id, token);
      setEditingPaper(full);
    } catch {
      setEditingPaper(paper);
    }
  }, [examId]);
 
  const handleEditSuccess = useCallback(async (msg: string) => {
    setEditingPaper(null);
    await fetchPapers();
    if (selectedPaper) {
      const token = getToken();
      if (token) {
        try {
          const updated = await paperService.get(examId, selectedPaper.paper_id, token);
          setSelectedPaper(updated); setSelectedPaperFull(updated);
        } catch {}
      }
    }
    setToast({ msg, type: "success" });
  }, [fetchPapers, selectedPaper, examId]);
 
  // ── Delete paper — step 1: show confirm dialog ────────────────────────────
  const handleDeleteRequest = useCallback((paper: Paper) => {
    setDeletingPaper(paper);
  }, []);
 
  // ── Delete paper — step 2: confirmed ─────────────────────────────────────
  const handleDeleteConfirmed = async () => {
    if (!deletingPaper) return;
    setDeleting(true);
    try {
      await deletePaper(deletingPaper.paper_id);
      if (selectedPaper?.paper_id === deletingPaper.paper_id) {
        setSelectedPaper(null); setSelectedPaperFull(null);
      }
      setDeletingPaper(null);
      setToast({ msg: "Paper deleted successfully.", type: "success" });
    } catch {
      setDeletingPaper(null);
      setToast({ msg: "Something went wrong while deleting the paper. Please try again.", type: "error" });
    } finally { setDeleting(false); }
  };
 
  // ── Check / grade paper ───────────────────────────────────────────────────
  const handleCheckPaper = async () => {
    if (!selectedPaper) return;
    const token = getToken();
    if (!token) return;
    setChecking(true);
    try {
      const result = await paperService.grade(examId, selectedPaper.paper_id, token);
      await fetchPapers();
      const full = await paperService.get(examId, selectedPaper.paper_id, token);
      setSelectedPaper(full); setSelectedPaperFull(full);
      setToast({ msg: `Graded: ${result.correct} / ${result.total_items} (${result.score_percent}%)`, type: "success" });
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : "Something went wrong while checking the paper. Please try again.", type: "error" });
    } finally { setChecking(false); }
  };
 
  // ── Paper added ───────────────────────────────────────────────────────────
  const handlePaperAdded = async () => {
    await fetchPapers();
    setToast({ msg: "Paper added successfully.", type: "success" });
  };
 
  // ── Generate answer key ───────────────────────────────────────────────────
  const handleGenerateKey = async () => {
    const currentExamPage = examPages[pageIdx];
    if (!currentExamPage) return;
    const token = getToken();
    if (!token) return;
    setGeneratingKey(true);
    try {
      await examService.generateAnswerKey(examId, currentExamPage.page_id, token);
      await loadExam();
      setToast({ msg: "The exam key has been successfully generated.", type: "success" });
    } catch {
      setToast({ msg: "We couldn't generate the exam key. Please try again.", type: "error" });
    } finally { setGeneratingKey(false); }
  };
 
  // ── Page nav ──────────────────────────────────────────────────────────────
  const examPages  = exam?.pages ?? [];
  const paperPages = selectedPaperFull?.paper_pages ?? [];
  const totalPages = Math.max(examPages.length, 1);
 
  const goPage = (dir: 1 | -1) => {
    setPageIdx(i => Math.min(Math.max(0, i + dir), examPages.length - 1));
    setExamImgErr(false); setPaperImgErr(false);
  };
 
  const currentExamPage  = examPages[pageIdx];
  const currentPaperPage = paperPages[pageIdx];
 
  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span className="spinner spinner-dark" />
        <span style={{ color: "var(--text-muted)" }}>Loading exam…</span>
      </main>
    </div>
  );
 
  if (loadError || !exam) return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div className="alert alert-error" role="alert">{loadError ?? "Exam not found."}</div>
        <Button variant="secondary" onClick={() => router.push("/exams")}>← Back to Exams</Button>
      </main>
    </div>
  );
 
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
 
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <button className="btn-icon" onClick={() => router.push("/exams")} aria-label="Back" style={{ color: "var(--navy)" }}>
            <IconBack />
          </button>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 700, color: "var(--navy)", flex: 1, textAlign: "center" }}>
            {exam.exam_name}
          </h1>
        </div>
 
        {exam.description && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            {exam.description}
          </p>
        )}
 
        {/* ── Exam section ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Exam</p>
          <Button variant="secondary" onClick={() => router.push(`/exams/${examId}/edit`)} style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}>
            Edit Exam
          </Button>
        </div>
 
        {/* Side-by-side viewer */}
        <div className="page-viewer">
          <div className="page-viewer-slot">
            {currentExamPage && !examImgErr ? (
              <img src={imgUrl(currentExamPage.image_path)} alt={`Exam page ${currentExamPage.page_number}`}
                onError={() => setExamImgErr(true)}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {examPages.length === 0 ? "No pages uploaded" : "Page unavailable"}
              </span>
            )}
          </div>
          <div className="page-viewer-slot" style={{ flexDirection: "column", gap: "0.5rem" }}>
            {loadingPaper ? (
              <span className="spinner spinner-dark" aria-label="Loading paper…" />
            ) : selectedPaperFull && currentPaperPage && !paperImgErr ? (
              <>
                <img src={imgUrl(currentPaperPage.image_path)} alt={`Paper page ${currentPaperPage.page_number}`}
                  onError={() => setPaperImgErr(true)}
                  style={{ maxWidth: "100%", maxHeight: "90%", objectFit: "contain" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{selectedPaper?.student_name}</span>
              </>
            ) : selectedPaper ? (
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem" }}>
                {paperImgErr ? "Image unavailable" : "No pages for this paper"}<br />
                <span style={{ fontSize: "0.78rem" }}>{selectedPaper.student_name}</span>
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Select test paper to check</span>
            )}
          </div>
        </div>
 
        {/* Page nav */}
        <div className="page-nav">
          <button className="btn-icon" onClick={() => goPage(-1)} disabled={pageIdx === 0} aria-label="Previous page"><IconLeft /></button>
          <span>Page {pageIdx + 1} of {totalPages}</span>
          <button className="btn-icon" onClick={() => goPage(1)} disabled={pageIdx >= examPages.length - 1} aria-label="Next page"><IconRight /></button>
          {selectedPaper && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
              {selectedPaper.student_name}
            </span>
          )}
        </div>
 
        {/* ── Answer Key section ── */}
        <p className="section-title">Answer Key</p>
        <div className="page-viewer" style={{ marginBottom: "1.5rem" }}>
          <div className="page-viewer-slot" style={{ alignItems: exam.answer_keys?.length ? "flex-start" : "center", padding: exam.answer_keys?.length ? "1rem" : 0, overflowY: "auto" }}>
            {exam.answer_keys && exam.answer_keys.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.1rem 2rem", width: "100%" }}>
                {exam.answer_keys.slice().sort((a, b) => a.question_number - b.question_number).map(ak => (
                  <div key={ak.answer_key_id} style={{ fontSize: "0.82rem", color: "var(--navy)", padding: "0.1rem 0" }}>
                    <span style={{ color: "var(--text-muted)", minWidth: 24, display: "inline-block" }}>{ak.question_number}.</span>
                    <span style={{ fontWeight: 600 }}>{ak.correct_answer}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Button variant="primary" onClick={handleGenerateKey} loading={generatingKey} disabled={!currentExamPage} style={{ width: "auto", padding: "0.65rem 1.25rem" }}>
                {generatingKey ? "Generating…" : "Generate Answer Key"}
              </Button>
            )}
          </div>
          <div className="page-viewer-slot" style={{ flexDirection: "column", gap: "0.75rem" }}>
            {selectedPaperFull && (selectedPaperFull.paper_scores ?? []).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.1rem 2rem", width: "100%", padding: "1rem", overflowY: "auto" }}>
                {(selectedPaperFull.paper_scores ?? []).slice().sort((a, b) => a.question_number - b.question_number).map(s => (
                  <div key={s.score_id} style={{ fontSize: "0.82rem", padding: "0.1rem 0", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span style={{ color: "var(--text-muted)", minWidth: 24 }}>{s.question_number}.</span>
                    <span style={{ fontWeight: 600, color: s.is_correct ? "var(--success)" : "var(--error)" }}>
                      {s.student_answer}
                    </span>
                  </div>
                ))}
              </div>
            ) : selectedPaper ? (
              <Button variant="primary" onClick={handleCheckPaper} loading={checking} disabled={checking} style={{ width: "auto", padding: "0.65rem 1.5rem" }}>
                {checking ? "Checking…" : "Check Paper"}
              </Button>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Select test paper to check</span>
            )}
          </div>
        </div>
 
        {/* ── Test Papers section ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Test Papers</p>
          <Button variant="secondary" onClick={() => setShowAddPaper(true)} style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem", borderColor: "var(--orange)", color: "var(--orange)" }}>
            Add paper
          </Button>
        </div>
 
        <PapersTable
          papers={papers}
          selectedPaperId={selectedPaper?.paper_id ?? null}
          onSelect={handleSelectPaper}
          onEdit={handleEditPaper}
          onDelete={handleDeleteRequest}
        />
 
        {/* ── Delete confirm dialog ── */}
        {deletingPaper && (
          <ConfirmDialog
            title="Delete Test Paper"
            message={`You are about to delete test paper "${deletingPaper.student_name}". Are you sure you want to continue?`}
            confirmLabel={deleting ? "Deleting…" : "Yes"}
            cancelLabel="No"
            onConfirm={handleDeleteConfirmed}
            onCancel={() => setDeletingPaper(null)}
            dangerous
          />
        )}
 
        {/* ── Modals ── */}
        {showAddPaper && (
          <AddEditPaperModal
            examId={examId}
            examPages={examPages.length || 1}
            onClose={() => setShowAddPaper(false)}
            onSuccess={handlePaperAdded}
          />
        )}
 
        {editingPaper && (
          <EditPaperModal
            paper={editingPaper}
            examId={examId}
            onClose={() => setEditingPaper(null)}
            onSuccess={handleEditSuccess}
          />
        )}
 
        {/* Toast */}
        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </main>
    </div>
  );
}