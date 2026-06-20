"use client";
import { useCallback } from "react";
import { getToken } from "@/lib/auth";
import { api } from "@/lib/api";
 
/**
 * Checks whether an exam has any test papers that have already been
 * checked/graded — used to decide whether editing the exam should show
 * the "this will reset scores" warning.
 */
export function useExamCheckedPapers() {
  const hasCheckedPapers = useCallback(async (examId: number): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    try {
      const result = await api.get<{ has_checked_papers: boolean }>(
        `/exams/${examId}/has-checked-papers`,
        token,
      );
      return result.has_checked_papers;
    } catch {
      return false;
    }
  }, []);
 
  return { hasCheckedPapers };
}