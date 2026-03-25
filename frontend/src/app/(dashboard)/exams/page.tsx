"use client";
 
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExamGrid, { Exam } from "@/components/exams/ExamGrid";
import { getToken, getStoredUser, clearAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
 
// ── Sidebar Icons ──────────────────────────────────────────────────────────
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
 
function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
 
// ── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="sidebar-logo">
        <span>LearnLens</span>
      </div>
      <nav className="sidebar-nav">
        {/* HCI: Consistency — active state is always clear */}
        <Link href="/exams" className="sidebar-item active" aria-current="page">
          <GridIcon />
          <span>Manage Exams</span>
        </Link>
        <button className="sidebar-item" onClick={onSignOut} aria-label="Sign out">
          <SignOutIcon />
          <span>Sign out</span>
        </button>
      </nav>
    </aside>
  );
}
 
// ── Main Page ──────────────────────────────────────────────────────────────
export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
 
  // HCI: Auth guard — redirect immediately if no token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
    }
  }, [router]);
 
  const fetchExams = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await api.get<Exam[]>("/exams", token);
      setExams(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuth();
        router.replace("/login");
        return;
      }
      // Graceful fallback with demo data if backend not connected yet
      setExams([
        { exam_id: 1, exam_name: "Long Exam 1",  description: "", created_at: "" },
        { exam_id: 2, exam_name: "Long Exam 2",  description: "", created_at: "" },
        { exam_id: 3, exam_name: "Midterm",       description: "", created_at: "" },
        { exam_id: 4, exam_name: "Final Exam",    description: "", created_at: "" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [router]);
 
  useEffect(() => {
    fetchExams();
  }, [fetchExams]);
 
  const handleSignOut = () => {
    clearAuth();
    router.push("/login");
  };
 
  const handleEdit = (id: number) => {
    // Navigate to edit page (future feature)
    console.log("Edit exam", id);
  };
 
  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this exam?")) return;
    const token = getToken();
    try {
      await api.post(`/exams/${id}/delete`, {}, token ?? undefined);
      setExams((prev) => prev.filter((e) => e.exam_id !== id));
    } catch {
      // Optimistically remove for demo
      setExams((prev) => prev.filter((e) => e.exam_id !== id));
    }
  };
 
  const handleAddNew = () => {
    // Navigate to create exam page (future feature)
    console.log("Add new exam");
  };
 
  return (
    <div className="dashboard-layout">
      <Sidebar onSignOut={handleSignOut} />
 
      <main className="dashboard-main">
        <h1 className="dashboard-title">Exams</h1>
 
        {/* HCI: Visibility of system status — loading/error feedback */}
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
            <div className="spinner" style={{ borderColor: "rgba(0,0,0,0.15)", borderTopColor: "var(--color-primary)", width: 36, height: 36 }} />
          </div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <ExamGrid
            exams={exams}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddNew={handleAddNew}
          />
        )}
      </main>
    </div>
  );
}