"use client";
import { useState, useCallback } from "react";
import { paperService } from "@/services/paperService";
import { Paper, PaperCreatePayload } from "@/types/paper";
import { getToken } from "@/lib/auth";
 
export function usePapers(examId: number) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const fetchPapers = useCallback(async () => {
    const token = getToken(); if (!token) return;
    setIsLoading(true); setError(null);
    try {
      const data = await paperService.list(examId, token);
      setPapers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load papers");
    } finally { setIsLoading(false); }
  }, [examId]);
 
  const createPaper = useCallback(async (payload: PaperCreatePayload): Promise<Paper | null> => {
    const token = getToken(); if (!token) return null;
    setIsLoading(true); setError(null);
    try {
      const paper = await paperService.create(examId, payload, token);
      setPapers(prev => [paper, ...prev]);
      return paper;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add paper");
      return null;
    } finally { setIsLoading(false); }
  }, [examId]);
 
  const deletePaper = useCallback(async (paperId: number) => {
    const token = getToken(); if (!token) return;
    try {
      await paperService.delete(examId, paperId, token);
      setPapers(prev => prev.filter(p => p.paper_id !== paperId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete paper");
    }
  }, [examId]);
 
  return { papers, isLoading, error, fetchPapers, createPaper, deletePaper };
}