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
  const { exams, isLoading, error, fetchExams, deleteExam } = useExams();
  const [mounted, setMounted] = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) { router.replace("/login"); return; }
    fetchExams();
  }, [fetchExams, router]);
 
  const handleAdd = () => router.push("/exams/create");
 
  const handleEdit = (exam: Exam) => router.push(`/exams/${exam.exam_id}`);
 
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
 
        {/* aria-live region for loading / errors (HCI: visibility of system status) */}
        <div aria-live="polite" aria-atomic="true" style={{ marginBottom: isLoading || error ? "1rem" : 0 }}>
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              <span className="spinner spinner-dark" aria-hidden="true" />
              Loading exams…
            </div>
          )}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
        </div>
 
        <ExamGrid exams={exams} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} />
      </main>
    </div>
  );
}