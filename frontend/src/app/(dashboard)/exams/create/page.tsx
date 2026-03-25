"use client";
 
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ExamGrid, { Exam } from "@/components/exams/ExamGrid";
import { getToken, clearAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
 
export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
 
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
      // Demo fallback while backend exam routes are pending
      setExams([
        { exam_id: 1, exam_name: "Long Exam 1", description: "", created_at: "" },
        { exam_id: 2, exam_name: "Long Exam 2", description: "", created_at: "" },
        { exam_id: 3, exam_name: "Midterm",      description: "", created_at: "" },
        { exam_id: 4, exam_name: "Final Exam",   description: "", created_at: "" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [router]);
 
  useEffect(() => {
    fetchExams();
  }, [fetchExams]);
 
  const handleEdit = (id: number) => {
    router.push(`/exams/${id}/edit`);
  };
 
  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this exam?")) return;
    const token = getToken();
    try {
      await api.post(`/exams/${id}/delete`, {}, token ?? undefined);
    } catch {
      // optimistic remove
    }
    setExams((prev) => prev.filter((e) => e.exam_id !== id));
  };
 
  const handleAddNew = () => router.push("/exams/create");
 
  return (
    <>
      <h1 className="dashboard-title">Exams</h1>
 
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <div
            className="spinner"
            style={{
              borderColor: "rgba(0,0,0,0.15)",
              borderTopColor: "var(--color-primary)",
              width: 36,
              height: 36,
            }}
          />
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
    </>
  );
}
