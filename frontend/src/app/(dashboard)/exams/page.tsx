"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import ExamGrid from "@/components/exams/ExamGrid";
import { useExams } from "@/hooks/useExams";
import { isAuthenticated } from "@/lib/auth";
import { Exam } from "@/types/exam";
 
export default function ManageExamsPage() {
  const router = useRouter();
  const { exams, isLoading, error, usingDemo, fetchExams, deleteExam } = useExams();
  const [mounted, setMounted] = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    fetchExams();
  }, [fetchExams, router]);
 
  const handleAdd    = () => router.push("/exams/create");
  const handleEdit   = (exam: Exam) => router.push(`/exams/${exam.exam_id}`);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this exam? This cannot be undone.")) return;
    await deleteExam(id);
  };
 
  if (!mounted) return null;
 
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content" aria-label="Manage Exams">
        <h1 className="page-title">Exams</h1>
 
        {usingDemo && !isLoading && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: "var(--orange-light)",
              border: "1px solid var(--orange)",
              borderRadius: "var(--radius-sm)",
              padding: "0.6rem 1rem",
              fontSize: "0.82rem",
              color: "var(--navy)",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>💡</span>
            <span>
              Showing demo exams — your database is empty or the backend is offline.
              Click <strong>+</strong> to create your first real exam.
            </span>
          </div>
        )}
 
        <div aria-live="polite" aria-atomic="true">
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              <span className="spinner spinner-dark" aria-hidden="true" />
              Loading exams…
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}
        </div>
 
        <ExamGrid
          exams={exams}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}