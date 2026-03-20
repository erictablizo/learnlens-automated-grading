"use client";
 
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Exam } from "@/types/user";
import ExamGrid from "@/components/exams/ExamGrid";
 
export default function ExamsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
 
  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);
 
  const fetchExams = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await api.get<Exam[]>("/exams", token);
      setExams(data);
    } catch {
      // silently fail or show toast
    }
  }, []);
 
  useEffect(() => {
    if (user) fetchExams();
  }, [user, fetchExams]);
 
  function handleEdit(exam: Exam) {
    router.push(`/exams/${exam.exam_id}/edit`);
  }
 
  async function handleDelete(examId: number) {
    const token = getToken();
    if (!token) return;
    if (!confirm("Delete this exam?")) return;
    try {
      await api.post(`/exams/${examId}/delete`, {}, token);
      setExams((prev) => prev.filter((e) => e.exam_id !== examId));
    } catch {
      alert("Failed to delete exam.");
    }
  }
 
  function handleAdd() {
    router.push("/exams/new");
  }
 
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <style jsx>{`
          .loading-screen {
            min-height: 100vh;
            background: #c9eaf0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .spinner {
            width: 36px; height: 36px;
            border: 3px solid #fff;
            border-top-color: #f5a623;
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }
 
  return (
    <div className="layout">
      {/* Mobile overlay */}
      {drawerOpen && (
        <div className="overlay" onClick={() => setDrawerOpen(false)} />
      )}
 
      {/* Sidebar / Drawer */}
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <nav className="nav">
          <button className="nav-item active">
            <span className="nav-icon">☰</span>
            Manage Exams
          </button>
          <button className="nav-item" onClick={logout}>
            <span className="nav-icon">→</span>
            Sign out
          </button>
        </nav>
      </aside>
 
      {/* Main content */}
      <div className="main">
        {/* Mobile hamburger */}
        <button
          className="hamburger"
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          ☰
        </button>
 
        <ExamGrid
          exams={exams}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      </div>
 
      <style jsx>{`
        .layout {
          min-height: 100vh;
          background: #c9eaf0;
          display: flex;
        }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.3);
          z-index: 10;
        }
        .sidebar {
          width: 200px;
          min-height: 100vh;
          background: #fff;
          padding: 28px 0 0;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #e2eaf2;
          z-index: 20;
        }
        .nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 12px;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          background: none;
          border: none;
          font-size: 0.9rem;
          color: #4a5568;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s, color 0.15s;
          font-weight: 500;
        }
        .nav-item:hover { background: #f0f7fa; color: #1a2e4a; }
        .nav-item.active { color: #1a2e4a; font-weight: 600; }
        .nav-icon { font-size: 1rem; width: 18px; text-align: center; }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .hamburger {
          display: none;
          position: absolute;
          top: 16px;
          left: 16px;
          background: #fff;
          border: none;
          border-radius: 6px;
          width: 36px;
          height: 36px;
          font-size: 1.1rem;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          z-index: 5;
        }
 
        @media (max-width: 640px) {
          .sidebar {
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
          }
          .sidebar.open { transform: translateX(0); }
          .hamburger { display: flex; align-items: center; justify-content: center; }
        }
      `}</style>
    </div>
  );
}