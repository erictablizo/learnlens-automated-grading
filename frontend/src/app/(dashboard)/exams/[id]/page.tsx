"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PapersTable, { TestPaper } from "@/components/papers/PapersTable";
import AddEditPaperModal from "@/components/papers/AddEditPaperModal";
import ViewPaperModal from "@/components/papers/ViewPaperModal";
import { getToken, clearAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────────────
interface ExamDetail {
  exam_id: number;
  exam_name: string;
  description: string;
  pages: { page_id: number; page_number: number; image_path: string }[];
}

// ── Sidebar icons ───────────────────────────────────────────────────────────
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// ── Demo data ───────────────────────────────────────────────────────────────
const DEMO_EXAM: ExamDetail = {
  exam_id: 1,
  exam_name: "Long Test 1",
  description:
    "",
  pages: [],
};

const DEMO_PAPERS: TestPaper[] = [];

// ── Page ────────────────────────────────────────────────────────────────────
export default function ViewExamPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const examId  = Number(params.id);

  const [exam, setExam]               = useState<ExamDetail | null>(null);
  const [papers, setPapers]           = useState<TestPaper[]>(DEMO_PAPERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading]     = useState(true);

  // Modal state
  const [showAddPaper, setShowAddPaper]   = useState(false);
  const [viewingPaper, setViewingPaper]   = useState<TestPaper | null>(null);

  // ── Fetch exam ─────────────────────────────────────────────────────────
  const fetchExam = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const data = await api.get<ExamDetail>(`/exams/${examId}`, token);
      setExam(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { clearAuth(); router.replace("/login"); return; }
      // Fallback demo data
      setExam({ ...DEMO_EXAM, exam_id: examId });
    } finally {
      setIsLoading(false);
    }
  }, [examId, router]);

  const fetchPapers = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await api.get<TestPaper[]>(`/exams/${examId}/papers`, token);
      setPapers(data);
    } catch {
      setPapers(DEMO_PAPERS);
    }
  }, [examId]);

  useEffect(() => { fetchExam(); fetchPapers(); }, [fetchExam, fetchPapers]);

  const handleDeletePaper = async (paperId: number) => {
    if (!confirm("Delete this test paper?")) return;
    const token = getToken();
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/papers/${paperId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
      setPapers((p) => p.filter((x) => x.paper_id !== paperId));
    } catch {
      setPapers((p) => p.filter((x) => x.paper_id !== paperId));
    }
  };

  const totalPages = Math.max(exam?.pages?.length ?? 0, 1);
  const currentImage = exam?.pages?.[currentPage - 1]?.image_path ?? null;

  if (isLoading) {
    return (
      <div className="dashboard-layout">
        <div style={{ display:"flex",justifyContent:"center",alignItems:"center",flex:1 }}>
          <div className="spinner" style={{ width:36,height:36,borderColor:"rgba(0,0,0,0.1)",borderTopColor:"var(--color-primary)" }}/>
        </div>
      </div>
    );
  }

  const examData = exam ?? { ...DEMO_EXAM, exam_id: examId };

  return (
    <>
      <div className="dashboard-layout">
        {/* Sidebar */}
        <aside className="sidebar" aria-label="Navigation">
          <div className="sidebar-logo"><span>LearnLens</span></div>
          <nav className="sidebar-nav">
            <Link href="/exams" className="sidebar-item active">
              <GridIcon /><span>Manage Exams</span>
            </Link>
            <Link href="/login" className="sidebar-item">
              <SignOutIcon /><span>Sign out</span>
            </Link>
          </nav>
        </aside>

        {/* Main */}
        <main className="dashboard-main ve-main">

          {/* ── Header row ── */}
          <div className="ve-header">
            <button className="ve-back-btn" onClick={() => router.push("/exams")} aria-label="Go back">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </button>
            <h1 className="ve-title">{examData.exam_name}</h1>
            <div style={{ width: 26 }} />
          </div>

          {/* ── Description ── */}
          <p className="ve-description">{examData.description}</p>

          {/* ── Exam section ── */}
          <div className="ve-section-row">
            <h2 className="ve-section-heading">Exam</h2>
            <Link href={`/exams/${examId}/edit`} className="ve-edit-btn">Edit Exam</Link>
          </div>

          {/* Exam page viewer + right panel */}
          <div className="ve-panels">
            {/* Left: exam page image */}
            <div className="ve-panel ve-panel--image">
              {currentImage ? (
                <img src={currentImage} alt={`Exam page ${currentPage}`} className="ve-exam-img" />
              ) : (
                <div className="ve-placeholder-img">
                  <span className="ve-placeholder-text">No image uploaded</span>
                </div>
              )}
            </div>

            {/* Right: select test paper placeholder */}
            <div className="ve-panel ve-panel--select">
              <span className="ve-select-text">Select test paper to check</span>
            </div>
          </div>

          {/* Page navigation */}
          <div className="ve-page-nav">
            <button
              className="ve-page-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeftIcon />
            </button>
            <span className="ve-page-label">Page {currentPage} of {totalPages}</span>
            <button
              className="ve-page-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRightIcon />
            </button>
          </div>

          {/* ── Answer Key section ── */}
          <h2 className="ve-section-heading" style={{ marginTop: 28 }}>Answer Key</h2>

          <div className="ve-panels">
            {/* Left: generate answer key */}
            <div className="ve-panel ve-panel--ak">
              <button className="ve-generate-btn">Generate Answer Key</button>
            </div>
            {/* Right: select test paper */}
            <div className="ve-panel ve-panel--select">
              <span className="ve-select-text">Select test paper to check</span>
            </div>
          </div>

          {/* ── Test Papers section ── */}
          <div className="ve-section-row" style={{ marginTop: 32 }}>
            <h2 className="ve-section-heading" style={{ margin: 0 }}>Test Papers</h2>
            <button
              className="ve-add-paper-btn"
              onClick={() => setShowAddPaper(true)}
            >
              Add paper
            </button>
          </div>

          <PapersTable
            papers={papers}
            onView={(p) => setViewingPaper(p)}
            onDelete={handleDeletePaper}
          />

        </main>
      </div>

      {/* Modals */}
      {showAddPaper && (
        <AddEditPaperModal
          examId={examId}
          onClose={() => setShowAddPaper(false)}
          onSaved={fetchPapers}
        />
      )}

      {viewingPaper && (
        <ViewPaperModal
          paper={viewingPaper}
          onClose={() => setViewingPaper(null)}
        />
      )}
    </>
  );
}