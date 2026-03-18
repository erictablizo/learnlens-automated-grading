"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ExamGrid from "@/components/exams/ExamGrid";
import { Exam } from "@/components/exams/ExamCard";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
 
export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
 
  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);
 
  const fetchExams = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<Exam[]>("/exams");
      setExams(data);
    } catch (err: any) {
      // 404 just means no exams yet — that's fine
      if (err?.response?.status !== 404) {
        setError("Failed to load exams.");
      }
      setExams([]);
    } finally {
      setLoading(false);
    }
  }, []);
 
  useEffect(() => {
    fetchExams();
  }, [fetchExams]);
 
  const handleEdit = (exam: Exam) => {
    router.push(`/exams/${exam.exam_id}/edit`);
  };
 
  const handleDelete = async (exam: Exam) => {
    if (!confirm(`Delete "${exam.exam_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/exams/${exam.exam_id}`);
      setExams((prev) => prev.filter((e) => e.exam_id !== exam.exam_id));
    } catch {
      alert("Failed to delete exam. Please try again.");
    }
  };
 
  const handleAdd = () => {
    router.push("/exams/new");
  };
 
  return (
    <DashboardLayout>
      <div style={styles.page}>
        <h1 style={styles.heading}>Exams</h1>
 
        {loading && (
          <div style={styles.center}>
            <p style={styles.loadingText}>Loading exams…</p>
          </div>
        )}
 
        {!loading && error && (
          <div style={styles.center}>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.retryBtn} onClick={fetchExams}>Retry</button>
          </div>
        )}
 
        {!loading && !error && (
          <ExamGrid
            exams={exams}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
 
const styles: Record<string, React.CSSProperties> = {
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  heading: {
    margin: 0,
    padding: "28px 32px 0",
    fontSize: 50,
    fontFamily: '"Rethink Sans", sans-serif',
    fontWeight: 500,
    color: "#1e3a5f",
    textAlign: "center",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
  },
  loadingText: { color: "#64748b", fontSize: 14 },
  errorText: { color: "#e53e3e", fontSize: 14 },
  retryBtn: {
    padding: "8px 20px",
    background: "#f59e0b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },
};