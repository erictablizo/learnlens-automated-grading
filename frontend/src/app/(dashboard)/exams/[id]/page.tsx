"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PapersTable, { TestPaper } from "@/components/papers/PapersTable";
import AddEditPaperModal from "@/components/papers/AddEditPaperModal";
import ViewPaperModal from "@/components/papers/ViewPaperModal";
import { getToken, clearAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────
interface ExamPage { page_id: number; page_number: number; image_path: string; }
interface ExamDetail {
  exam_id: number;
  exam_name: string;
  description: string;
  pages: ExamPage[];
}

// ── Icons ─────────────────────────────────────────────────────────────────────
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

function ArrowLeftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// ── Demo fallback ─────────────────────────────────────────────────────────────
const DEMO_EXAM: ExamDetail = {
  exam_id: 1,
  exam_name: "Long Test 1",
  description:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi justo odio, imperdiet dictum lectus in, tempus porta ante. Cras hendrerit metus quis bibendum aliquet.",
  pages: [],
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ViewExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const examId = Number(params.id);

  const [exam, setExam]               = useState<ExamDetail | null>(null);
  const [papers, setPapers]           = useState<TestPaper[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading]     = useState(true);
  const [showAddPaper, setShowAddPaper]   = useState(false);
  const [viewingPaper, setViewingPaper]   = useState<TestPaper | null>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchExam = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const data = await api.get<ExamDetail>(`/exams/${examId}`, token);
      setExam(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { clearAuth(); router.replace("/login"); return; }
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
    } catch { /* keep empty */ }
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
    } catch { /* optimistic */ }
    setPapers((p) => p.filter((x) => x.paper_id !== paperId));
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const examData  = exam ?? { ...DEMO_EXAM, exam_id: examId };
  const totalPages = Math.max(examData.pages?.length ?? 0, 1);
  const currentImg = examData.pages?.[currentPage - 1]?.image_path ?? null;

  // ── Loading ──────────────────────────────────────────────────────────────────
  // HCI: Visibility of system status — loading indicator while fetching
  if (isLoading) {
    return (
      <div className="dashboard-layout">
        <div className="ve-loading-wrap" aria-live="polite" aria-label="Loading exam">
          <div className="ve-loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-layout">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="sidebar" aria-label="Navigation">
          <div className="sidebar-logo"><span>LearnLens</span></div>
          <nav className="sidebar-nav">
            <Link href="/exams" className="sidebar-item active" aria-current="page">
              <GridIcon /><span>Manage Exams</span>
            </Link>
            <Link href="/login" className="sidebar-item">
              <SignOutIcon /><span>Sign out</span>
            </Link>
          </nav>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <main className="dashboard-main ve-main">

          {/* Header: back arrow + title */}
          <div className="ve-header">
            <button
              className="ve-back-btn"
              onClick={() => router.push("/exams")}
              aria-label="Back to Manage Exams"
            >
              <ArrowLeftIcon />
            </button>
            <h1 className="ve-title">{examData.exam_name}</h1>
            {/* Spacer keeps title centred */}
            <div className="ve-header-spacer" aria-hidden="true" />
          </div>

          {/* Description */}
          <p className="ve-desc">{examData.description}</p>

          {/* ── Exam section ────────────────────────────────────────────────── */}
          <div className="ve-section-bar">
            <h2 className="ve-section-heading">Exam</h2>
            <Link href={`/exams/${examId}/edit`} className="ve-edit-btn">Edit Exam</Link>
          </div>

          {/* Two panels */}
          <div className="ve-panels">
            {/* Left: exam scan */}
            <div className="ve-panel ve-panel--scan">
              {currentImg ? (
                <img src={currentImg} alt={`Exam page ${currentPage}`} className="ve-scan-img" />
              ) : (
                <div className="ve-scan-placeholder" aria-label="No exam image uploaded">
                  <span className="ve-placeholder-txt">No image uploaded</span>
                </div>
              )}
            </div>
            {/* Right: select paper */}
            <div className="ve-panel ve-panel--hint">
              <span className="ve-hint-txt">Select test paper to check</span>
            </div>
          </div>

          {/* Page navigation — HCI: user control & freedom */}
          <div className="ve-page-nav" aria-label="Exam page navigation">
            <button
              className="ve-nav-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeftIcon />
            </button>
            {/* HCI: Give away spoilers — always shows current position */}
            <span className="ve-page-label" aria-live="polite">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="ve-nav-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRightIcon />
            </button>
          </div>

          {/* ── Answer Key section ──────────────────────────────────────────── */}
          <h2 className="ve-section-heading ve-section-heading--mt">Answer Key</h2>

          <div className="ve-panels">
            <div className="ve-panel ve-panel--ak">
              <button className="ve-generate-btn">Generate Answer Key</button>
            </div>
            <div className="ve-panel ve-panel--hint">
              <span className="ve-hint-txt">Select test paper to check</span>
            </div>
          </div>

          {/* ── Test Papers section ─────────────────────────────────────────── */}
          <div className="ve-section-bar ve-section-bar--mt">
            <h2 className="ve-section-heading">Test Papers</h2>
            <button
              className="ve-add-paper-btn"
              onClick={() => setShowAddPaper(true)}
              aria-label="Add test paper"
            >
              Add paper
            </button>
          </div>

          {/* HCI: Feedback — live region updates when papers change */}
          <div aria-live="polite" aria-atomic="false">
            <PapersTable
              papers={papers}
              onView={(p) => setViewingPaper(p)}
              onDelete={handleDeletePaper}
            />
          </div>

        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
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