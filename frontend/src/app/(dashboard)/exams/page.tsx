"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import ExamGrid from "@/components/exams/ExamGrid";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useExams } from "@/hooks/useExams";
import { useExamCheckedPapers } from "@/hooks/useExamCheckedPapers";
import { isAuthenticated } from "@/lib/auth";
import { Exam } from "@/types/exam";
 
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
 
export default function ManageExamsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { exams, isLoading, error, usingDemo, fetchExams, deleteExam } = useExams();
  const { hasCheckedPapers } = useExamCheckedPapers();
 
  const [mounted, setMounted] = useState(false);
  const [toast,   setToast]   = useState<{ msg: string; type: "success" | "error" } | null>(null);
 
  // Edit confirm (when exam has checked papers)
  const [editConfirmExam, setEditConfirmExam] = useState<Exam | null>(null);
  const [checkingEdit,    setCheckingEdit]    = useState<number | null>(null);
 
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [deleting,     setDeleting]     = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) { router.replace("/login"); return; }
    fetchExams();
 
    // Show success toast after redirect from Edit Exam save
    if (searchParams.get("updated") === "1") {
      setToast({ msg: "Exam updated successfully.", type: "success" });
      router.replace("/exams"); // clean the URL
    }
  }, [fetchExams, router, searchParams]);
 
  const handleAdd = () => router.push("/exams/create");
 
  // ── Edit click — check for graded papers first ────────────────────────────
  const handleEdit = useCallback(async (exam: Exam) => {
    setCheckingEdit(exam.exam_id);
    const hasChecked = await hasCheckedPapers(exam.exam_id);
    setCheckingEdit(null);
 
    if (hasChecked) {
      setEditConfirmExam(exam);
    } else {
      router.push(`/exams/${exam.exam_id}/edit`);
    }
  }, [hasCheckedPapers, router]);
 
  const handleEditConfirmed = () => {
    if (editConfirmExam) {
      router.push(`/exams/${editConfirmExam.exam_id}/edit`);
    }
    setEditConfirmExam(null);
  };
 
  // ── Delete click ───────────────────────────────────────────────────────────
  const handleDeleteRequest = (id: number) => {
    const exam = exams.find(e => e.exam_id === id);
    if (exam) setDeleteTarget(exam);
  };
 
  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExam(deleteTarget.exam_id);
      setDeleteTarget(null);
      setToast({ msg: "Exam deleted successfully.", type: "success" });
    } catch {
      setDeleteTarget(null);
      setToast({ msg: "Something went wrong while deleting the exam. Please try again.", type: "error" });
    } finally {
      setDeleting(false);
    }
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
              background: "var(--orange-light)", border: "1px solid var(--orange)",
              borderRadius: "var(--radius-sm)", padding: "0.6rem 1rem",
              fontSize: "0.82rem", color: "var(--navy)", marginBottom: "1.25rem",
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}
          >
            <span>💡</span>
            <span>Showing demo exams — click <strong>+</strong> to create your first real exam.</span>
          </div>
        )}
 
        <div aria-live="polite" aria-atomic="true">
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              <span className="spinner spinner-dark" aria-hidden="true" />
              Loading exams…
            </div>
          )}
          {error && <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
        </div>
 
        <ExamGrid
          exams={exams}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
        />
 
        {/* Edit confirm dialog — only shown if exam has checked papers */}
        {editConfirmExam && (
          <ConfirmDialog
            title="Are you sure you want to continue?"
            message={`You are about to make changes to exam "${editConfirmExam.exam_name}". Proceeding will reset the scores of test papers under this exam.`}
            confirmLabel="Yes"
            cancelLabel="No"
            onConfirm={handleEditConfirmed}
            onCancel={() => setEditConfirmExam(null)}
            dangerous
          />
        )}
 
        {/* Delete confirm dialog */}
        {deleteTarget && (
          <ConfirmDialog
            title="Delete Test Paper"
            message={`You are about to delete exam "${deleteTarget.exam_name}". Are you sure you want to continue?`}
            confirmLabel={deleting ? "Deleting…" : "Yes"}
            cancelLabel="No"
            onConfirm={handleDeleteConfirmed}
            onCancel={() => setDeleteTarget(null)}
            dangerous
          />
        )}
 
        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </main>
    </div>
  );
}