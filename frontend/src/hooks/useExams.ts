"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { examService } from "@/services/examService";
import { Exam, ExamCreatePayload } from "@/types/exam";
import { getToken, clearAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
 
export function useExams() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const fetchExams = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true); setError(null);
    try {
      const data = await examService.list(token);
      setExams(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { clearAuth(); router.replace("/login"); return; }
      // Graceful fallback with demo data if backend not connected yet
      setExams([
        { exam_id: 1, exam_name: "Long Exam 1", description: "", created_at: "" },
        { exam_id: 2, exam_name: "Long Exam 2", description: "", created_at: "" },
        { exam_id: 3, exam_name: "Midterm", description: "", created_at: "" },
        { exam_id: 4, exam_name: "Final Exam", description: "", created_at: "" },
      ]);
    } finally { setIsLoading(false); }
  }, [router]);
 
  const createExam = useCallback(async (payload: ExamCreatePayload): Promise<Exam | null> => {
    const token = getToken(); if (!token) return null;
    setIsLoading(true); setError(null);
    try {
      const exam = await examService.create(payload, token);
      setExams(prev => [exam, ...prev]);
      return exam;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam");
      return null;
    } finally { setIsLoading(false); }
  }, []);
 
  const deleteExam = useCallback(async (id: number) => {
    const token = getToken(); if (!token) return;
    try {
      await examService.delete(id, token);
      setExams(prev => prev.filter(e => e.exam_id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete exam");
    }
  }, []);
 
  const updateExam = useCallback(async (id: number, payload: Partial<ExamCreatePayload>): Promise<Exam | null> => {
    const token = getToken(); if (!token) return null;
    try {
      const updated = await examService.update(id, payload, token);
      setExams(prev => prev.map(e => e.exam_id === id ? updated : e));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update exam");
      return null;
    }
  }, []);
 
  return { exams, isLoading, error, fetchExams, createExam, deleteExam, updateExam };
}