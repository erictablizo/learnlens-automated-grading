"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { examService } from "@/services/examService";
import { Exam, ExamCreatePayload } from "@/types/exam";
import { getToken, clearAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

/**
 * CHANGED 2026-11-17 — the demo exam is gone, and deleteExam rethrows.
 *
 * There used to be a DEMO_EXAMS list holding one fabricated exam with
 * `exam_id: 1`, substituted into `exams` whenever the real list came back
 * empty OR the request failed. Its id collided with a real exam's id, in two
 * places:
 *
 *   deleteExam(1)  matched `DEMO_EXAMS.find(...)`, removed the card from local
 *                  state and RETURNED WITHOUT CALLING THE SERVER. The page saw
 *                  no exception and showed "Exam deleted successfully." while
 *                  the row sat untouched in the database — reported from the
 *                  Administrator screen, which still counted it.
 *
 *   createExam()   filtered `prev` through the same `DEMO_EXAMS.find(...)`, so
 *                  adding any exam silently dropped real exam 1 from the grid
 *                  until the next reload.
 *
 * Neither was specific to an administrator. Any account whose exam happened to
 * be id 1 hit both.
 *
 * The second half of the same fault: the old `deleteExam` caught every error
 * and resolved anyway, so `handleDeleteConfirmed`'s error branch in
 * app/(dashboard)/exams/page.tsx was unreachable — a 404, a 500 and an
 * unreachable backend all reported "Exam deleted successfully." It now
 * rethrows, and does NOT setError as well: the page reports the failure as a
 * toast, and setting both would put a red bar and a toast on screen for one
 * event.
 *
 * An empty list now renders as an empty list — ExamGrid still draws its "+"
 * button, which is exactly what the screen looked like after a delete.
 */
export function useExams() {
  const router = useRouter();
  const [exams,     setExams]     = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      setExams(await examService.list(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuth();
        router.replace("/login");
        return;
      }
      // The list is LEFT AS IT WAS rather than replaced. A failed refresh
      // should not empty a grid that is already showing the teacher's exams;
      // the alert bar on the page says the refresh failed.
      setError(err instanceof Error ? err.message : "Could not load your exams.");
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
      setExams(prev => [exam, ...prev]);
      return exam;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * RETHROWS on purpose. The caller decides what to say; this only reports
   * what happened. The card is removed from the grid ONLY after the server has
   * confirmed the delete, so a failed delete leaves the exam visible instead of
   * hiding a row that still exists.
   */
  const deleteExam = useCallback(async (id: number): Promise<void> => {
    const token = getToken();
    if (!token) throw new ApiError(401, "You are signed out. Sign in and try again.");
    await examService.delete(id, token);
    setExams(prev => prev.filter(e => e.exam_id !== id));
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

  return { exams, isLoading, error, fetchExams, createExam, deleteExam, updateExam };
}