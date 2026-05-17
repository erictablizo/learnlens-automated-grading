"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { examService } from "@/services/examService";
import { Exam, ExamCreatePayload } from "@/types/exam";
import { getToken, clearAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
 
const DEMO_EXAMS: Exam[] = [
  { exam_id: 1, exam_name: "Midterm", description: "", created_at: new Date().toISOString() }
];
 
export function useExams() {
  const router = useRouter();
  const [exams,     setExams]     = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);   // ← always present
 
  const fetchExams = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await examService.list(token);
      if (data.length === 0) {
        setExams(DEMO_EXAMS);
        setUsingDemo(true);
      } else {
        setExams(data);
        setUsingDemo(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuth();
        router.replace("/login");
        return;
      }
      setExams(DEMO_EXAMS);
      setUsingDemo(true);
    } finally {
      setIsLoading(false);
    }
  }, [router]);
 
  const createExam = useCallback(async (payload: ExamCreatePayload): Promise<Exam | null> => {
    const token = getToken();
    if (!token) return null;
    setIsLoading(true);
    setError(null);
    try {
      const exam = await examService.create(payload, token);
      setExams(prev => {
        const real = prev.filter(e => !DEMO_EXAMS.find(d => d.exam_id === e.exam_id));
        return [exam, ...real];
      });
      setUsingDemo(false);
      return exam;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
 
  const deleteExam = useCallback(async (id: number) => {
    const token = getToken();
    if (!token) return;
    if (DEMO_EXAMS.find(d => d.exam_id === id)) {
      setExams(prev => prev.filter(e => e.exam_id !== id));
      return;
    }
    try {
      await examService.delete(id, token);
      setExams(prev => prev.filter(e => e.exam_id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete exam");
    }
  }, []);
 
  const updateExam = useCallback(async (id: number, payload: Partial<ExamCreatePayload>): Promise<Exam | null> => {
    const token = getToken();
    if (!token) return null;
    try {
      const updated = await examService.update(id, payload, token);
      setExams(prev => prev.map(e => e.exam_id === id ? updated : e));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update exam");
      return null;
    }
  }, []);
 
  return { exams, isLoading, error, usingDemo, fetchExams, createExam, deleteExam, updateExam };
}