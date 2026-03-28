"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import PapersTable from "@/components/papers/PapersTable";
import AddEditPaperModal from "@/components/papers/AddEditPaperModal";
import ViewPaperModal from "@/components/papers/ViewPaperModal";
import { examService } from "@/services/examService";
import { Exam, ExamPage } from "@/types/exam";
import { Paper } from "@/types/paper";
import { usePapers } from "@/hooks/usePapers";
import { getToken, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";
 
const IconBack = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const IconChevronLeft = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
 
export default function ViewExamPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.exam_id ?? params?.id ?? 0);
 
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
 
  // Page viewer state
  const [examPageIdx, setExamPageIdx] = useState(0);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
 
  // Paper modals
  const [showAddPaper, setShowAddPaper] = useState(false);
  const [viewPaper, setViewPaper] = useState<Paper | null>(null);
 
  const { papers, fetchPapers, deletePaper } = usePapers(examId);
 
  const loadExam = useCallback(async () => {
    if (!examId) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true); setError(null);
    try {
      const data = await examService.get(examId, token);
      setExam(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace("/login"); return; }
      setError("Could not load exam.");
    } finally { setLoading(false); }
  }, [examId, router]);
 
  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    loadExam();
    fetchPapers();
  }, [loadExam, fetchPapers, router]);
 
  const pages: ExamPage[] = exam?.pages ?? [];
  const totalPages = Math.max(pages.length, 1);
  const currentPage = pages[examPageIdx];
 
  const handleGenerateKey = async () => {
    if (!currentPage) return;
    const token = getToken();
    if (!token) return;
    setGeneratingKey(true); setKeyMsg(null);
    try {
      const res = await examService.generateAnswerKey(examId, currentPage.page_id, token);
      setKeyMsg(res.message ?? "Answer key generation started.");
      await loadExam();
    } catch {
      setKeyMsg("Generation failed. Please try again.");
    } finally { setGeneratingKey(false); }
  };
 
  const handleDeletePaper = async (paperId: number) => {
    if (!confirm("Delete this test paper?")) return;
    await deletePaper(paperId);
    await fetchPapers();
  };
 
  if (loading) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="spinner spinner-dark" aria-hidden="true" />
          <span style={{ color: "var(--text-muted)" }}>Loading exam…</span>
        </main>
      </div>
    );
  }
 
  if (error || !exam) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content">
          <div className="alert alert-error" role="alert">{error ?? "Exam not found."}</div>
          <Button variant="secondary" onClick={() => router.push("/exams")}>← Back to Exams</Button>
        </main>
      </div>
    );
  }
 
  return (
    <div className="dashboard-layout">
      <Navbar />
 
      <main className="main-content">
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <button
            className="btn-icon"
            onClick={() => router.push("/exams")}
            aria-label="Back to Manage Exams"
            style={{ color: "var(--navy)" }}
          >
            <IconBack />
          </button>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 700, color: "var(--navy)", flex: 1, textAlign: "center" }}>
            {exam.exam_name}
          </h1>
        </div>
 
        {/* Description */}
        {exam.description && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            {exam.description}
          </p>
        )}
 
        {/* ── Exam Pages Section ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Exam</p>
          <Button
            variant="secondary"
            onClick={() => router.push(`/exams/${examId}/create`)}
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}
          >
            Edit Exam
          </Button>
        </div>
 
        {/* Page viewer (2-up layout) */}
        <div className="page-viewer">
          <div className="page-viewer-slot">
            {currentPage ? (
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                📄 Page {currentPage.page_number}
                <br />
                <span style={{ fontSize: "0.75rem" }}>{currentPage.image_path.split("/").pop()}</span>
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No pages uploaded</span>
            )}
          </div>
          <div className="page-viewer-slot" style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Select test paper to check
          </div>
        </div>
 
        {/* Page navigation */}
        {pages.length > 1 && (
          <div className="page-nav" aria-label="Page navigation">
            <button
              className="btn-icon"
              onClick={() => setExamPageIdx(i => Math.max(0, i - 1))}
              disabled={examPageIdx === 0}
              aria-label="Previous page"
            >
              <IconChevronLeft />
            </button>
            <span>Page {examPageIdx + 1} of {totalPages}</span>
            <button
              className="btn-icon"
              onClick={() => setExamPageIdx(i => Math.min(pages.length - 1, i + 1))}
              disabled={examPageIdx >= pages.length - 1}
              aria-label="Next page"
            >
              <IconChevronRight />
            </button>
          </div>
        )}
        {pages.length <= 1 && (
          <p className="page-nav">Page 1 of {totalPages}</p>
        )}
 
        {/* ── Answer Key Section ── */}
        <p className="section-title">Answer Key</p>
 
        {keyMsg && (
          <div role="status" aria-live="polite" className="alert alert-success" style={{ marginBottom: "0.75rem" }}>
            {keyMsg}
          </div>
        )}
 
        <div className="page-viewer" style={{ marginBottom: "1.5rem" }}>
          <div className="page-viewer-slot" style={{ flexDirection: "column", gap: "0.75rem" }}>
            {exam.answer_keys && exam.answer_keys.length > 0 ? (
              <div style={{ padding: "0.75rem", width: "100%", overflowY: "auto", maxHeight: "340px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", color: "var(--text-muted)", padding: "0.25rem 0.5rem" }}>#</th>
                      <th style={{ textAlign: "left", color: "var(--text-muted)", padding: "0.25rem 0.5rem" }}>Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exam.answer_keys.map(ak => (
                      <tr key={ak.answer_key_id}>
                        <td style={{ padding: "0.2rem 0.5rem", color: "var(--text-muted)" }}>{ak.question_number}</td>
                        <td style={{ padding: "0.2rem 0.5rem", fontWeight: 600, color: "var(--navy)" }}>{ak.correct_answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={handleGenerateKey}
                loading={generatingKey}
                disabled={!currentPage}
                style={{ width: "auto", padding: "0.65rem 1.25rem" }}
              >
                {generatingKey ? "Generating…" : "Generate Answer Key"}
              </Button>
            )}
          </div>
          <div className="page-viewer-slot" style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Select test paper to check
          </div>
        </div>
 
        {/* ── Test Papers Section ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Test Papers</p>
          <Button
            variant="secondary"
            onClick={() => setShowAddPaper(true)}
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem", borderColor: "var(--orange)", color: "var(--orange)" }}
          >
            Add paper
          </Button>
        </div>
 
        <PapersTable
          papers={papers}
          onView={p => setViewPaper(p)}
          onDelete={handleDeletePaper}
        />
 
        {/* Add paper modal */}
        {showAddPaper && (
          <AddEditPaperModal
            examId={examId}
            onClose={() => setShowAddPaper(false)}
            onSuccess={fetchPapers}
          />
        )}
 
        {/* View paper modal */}
        {viewPaper && (
          <ViewPaperModal
            paper={viewPaper}
            onClose={() => setViewPaper(null)}
          />
        )}
      </main>
    </div>
  );
}