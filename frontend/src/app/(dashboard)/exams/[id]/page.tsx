"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PapersTable from "@/components/papers/PapersTable";
import AddEditPaperModal from "@/components/papers/AddEditPaperModal";
import EditPaperModal from "@/components/papers/EditPaperModal";
import { examService } from "@/services/examService";
import QuestionTypeModal from "@/components/exams/QuestionTypeModal";
// NEW 2026-11-11 — Alex Passion / Julius Bancud, post-UAT page 2:
// "Can override or edit scanned answer in Answer Key (Column)". The panel
// owns the grid, the inline edit and both button states; this page owns
// the reload and the toast.
import AnswerKeyPanel from "@/components/exams/AnswerKeyPanel";
// NEW 2026-11-11 — the student's answers become editable in the right-hand
// slot, mirroring what AnswerKeyPanel did for the key on the left. This is
// where the panel's "override on one Test Paper" lives: ViewPaperModal is NOT
// mounted on this page, so a table inside it would never be seen from here.
import AnswerTable from "@/components/papers/AnswerTable";
// NEW 2026-11-12 — "Batch upload -> of Exam" (Alex Passion / Julius Bancud,
// page 2 item 7). Lives here rather than on the Students page because a batch
// belongs to ONE exam, and this screen already knows which.
import BatchUploadModal from "@/components/papers/BatchUploadModal";
import type { PaperAnswerResult } from "@/types/paperAnswer";
import { scoreFromGrade, formatScore, formatPercent } from "@/lib/scoreLabel";
import { paperService } from "@/services/paperService";
import { Exam, QuestionType } from "@/types/exam";
import { Paper } from "@/types/paper";
import { AnswerKeyUpdateResult } from "@/types/answerKey";
import { usePapers } from "@/hooks/usePapers";
import { getToken, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { downloadExamXlsx, downloadErrorMessage } from "@/services/exportService";

// ── icons ─────────────────────────────────────────────────────────────────────
const IconBack = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const IconLeft = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const IconRight = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

// ── helpers ───────────────────────────────────────────────────────────────────
const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");

function imgUrl(path: string): string {
  return `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
}

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ViewExamPage() {
  const params  = useParams();
  const router  = useRouter();
  const examId  = Number(params?.id ?? params?.exam_id ?? 0);

  // Exam
  const [exam,          setExam]          = useState<Exam | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);

  // Commented on 2026-09-4:
  // const [generatingKey, setGeneratingKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showQuestionTypeModal, setShowQuestionTypeModal] = useState(false);
  // CHANGED 2026-11-01. Widened from "true_false" | "encircled". Since the
  // 2026-10-22 button removal the modal only ever sends "mixed", which that
  // union excluded - the type described a dialog that no longer exists.
  const [selectedQuestionType, setSelectedQuestionType] = useState<QuestionType | null>(null);

  // Page viewer
  const [pageIdx,     setPageIdx]     = useState(0);
  const [examImgErr,  setExamImgErr]  = useState(false);
  const [paperImgErr, setPaperImgErr] = useState(false);

  // Selected paper
  const [selectedPaper,     setSelectedPaper]     = useState<Paper | null>(null);
  const [selectedPaperFull, setSelectedPaperFull] = useState<Paper | null>(null);
  const [loadingPaper,      setLoadingPaper]       = useState(false);

  // Grading
  const [checking, setChecking] = useState(false);

  // Delete confirm dialog
  const [deletingPaper, setDeletingPaper] = useState<Paper | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  // Modals
  const [showAddPaper, setShowAddPaper] = useState(false);
  const [showBatchUpload, setShowBatchUpload] = useState(false);   // NEW 2026-11-12
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const { papers, fetchPapers, deletePaper } = usePapers(examId);
  

  // ── Load exam ─────────────────────────────────────────────────────────────
  const loadExam = useCallback(async () => {
    if (!examId) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true); setLoadError(null);
    try {
      const data = await examService.get(examId, token);
      setExam(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace("/login"); return; }
      setLoadError("Could not load exam.");
    } finally { setLoading(false); }
  }, [examId, router]);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    loadExam();
    fetchPapers();
  }, [loadExam, fetchPapers, router]);

  // ── Load full paper detail ────────────────────────────────────────────────
  const loadPaperDetail = useCallback(async (paper: Paper) => {
    setLoadingPaper(true); setPaperImgErr(false);
    const token = getToken();
    if (!token) { setLoadingPaper(false); return; }
    try {
      const full = await paperService.get(examId, paper.paper_id, token);
      setSelectedPaperFull(full);
    } catch {
      setSelectedPaperFull(null);
    } finally { setLoadingPaper(false); }
  }, [examId]);

  // ── Select paper row ──────────────────────────────────────────────────────
  const handleSelectPaper = useCallback(async (paper: Paper) => {
    if (selectedPaper?.paper_id === paper.paper_id) {
      setSelectedPaper(null); setSelectedPaperFull(null); return;
    }
    setSelectedPaper(paper); setSelectedPaperFull(null); setPageIdx(0);
    await loadPaperDetail(paper);
  }, [selectedPaper, loadPaperDetail]);

  // ── Edit paper ────────────────────────────────────────────────────────────
  const handleEditPaper = useCallback(async (paper: Paper) => {
    const token = getToken();
    if (!token) return;
    try {
      const full = await paperService.get(examId, paper.paper_id, token);
      setEditingPaper(full);
    } catch {
      setEditingPaper(paper);
    }
  }, [examId]);

  const handleEditSuccess = useCallback(async (msg: string) => {
    setEditingPaper(null);
    await fetchPapers();
    if (selectedPaper) {
      const token = getToken();
      if (token) {
        try {
          const updated = await paperService.get(examId, selectedPaper.paper_id, token);
          setSelectedPaper(updated); setSelectedPaperFull(updated);
        } catch {}
      }
    }
    setToast({ msg, type: "success" });
  }, [fetchPapers, selectedPaper, examId]);

    // NEW 2026-11-12 — Excel export (Alex & Bancud, page 2 item 6)
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadExcel = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadExamXlsx(examId);
    } catch (e) {
      setDownloadError(downloadErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  // ── Delete paper — step 1: show confirm dialog ────────────────────────────
  const handleDeleteRequest = useCallback((paper: Paper) => {
    setDeletingPaper(paper);
  }, []);

  // ── Delete paper — step 2: confirmed ─────────────────────────────────────
  const handleDeleteConfirmed = async () => {
    if (!deletingPaper) return;
    setDeleting(true);
    try {
      await deletePaper(deletingPaper.paper_id);
      if (selectedPaper?.paper_id === deletingPaper.paper_id) {
        setSelectedPaper(null); setSelectedPaperFull(null);
      }
      setDeletingPaper(null);
      setToast({ msg: "Paper deleted successfully.", type: "success" });
    } catch {
      setDeletingPaper(null);
      setToast({ msg: "Something went wrong while deleting the paper. Please try again.", type: "error" });
    } finally { setDeleting(false); }
  };

  // ── Check / grade paper ───────────────────────────────────────────────────
  const handleCheckPaper = async () => {
    if (!selectedPaper) return;
    const token = getToken();
    if (!token) return;
    setChecking(true);
    try {
      const result = await paperService.grade(examId, selectedPaper.paper_id, token);
      await fetchPapers();
      const full = await paperService.get(examId, selectedPaper.paper_id, token);
      setSelectedPaper(full); setSelectedPaperFull(full);
      // Commented on 2026-09-23:
      // setToast({ msg: `Graded: ${result.correct} / ${result.total_items} (${result.score_percent}%)`, type: "success" });
      //
      // CHANGED 2026-11-11. `${result.correct} / ${result.total_items}` is the
      // FLOOR on a paper with items under review, announced as if it were the
      // result. MEASURED on the 2026-10-24 paper: it said "Graded: 11 / 19
      // (57.9%)" for a paper whose true score was 15, with four items pending
      // and nothing on screen to say so. GradeResponse has carried
      // max_possible / needs_review / is_final since that same day.
      const r = scoreFromGrade(result);
      const pct = formatPercent(r);
      setToast({
        msg: `Graded: ${formatScore(r)}${pct ? ` (${pct})` : ""}`
             + (r.isFinal ? "" : ` — ${r.needsReview} item(s) need your review`)
             + (result.warning ? ` — ${result.warning}` : ""),
        type: (result.warning || !r.isFinal) ? "error" : "success",
      });
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : "Something went wrong while checking the paper. Please try again.", type: "error" });
    } finally { setChecking(false); }
  };

  // ── Paper added ───────────────────────────────────────────────────────────
  const handlePaperAdded = async () => {
    await fetchPapers();
    setToast({ msg: "Paper added successfully.", type: "success" });
  };

  // ── A whole class uploaded ────────────────────────────────────────────────
  // NEW 2026-11-12. The modal has already reported per student in its own
  // table; this only reloads the list and repeats the one-line summary.
  //
  // `clean` is false when ANY paper failed or landed with only some of its
  // pages - a half-uploaded paper is counted as a problem even though its row
  // exists, because grading it would score against missing pages and report a
  // wrong number rather than an error.
  const handleBatchFinished = useCallback(async (summary: string, clean: boolean) => {
    await fetchPapers();
    setToast({ msg: summary, type: clean ? "success" : "error" });
  }, [fetchPapers]);

  // ── Answer key item corrected ─────────────────────────────────────────────
  // NEW 2026-11-11. The server has ALREADY re-checked every paper against the
  // new answer and re-totalled the affected students - that cascade is the
  // whole recommendation. Nothing is recomputed here; the scores on screen are
  // simply stale, so they are reloaded, and then what happened is SAID. A
  // silent recount is the thing both reviewers were complaining about.
  const handleKeySaved = useCallback(async (result: AnswerKeyUpdateResult) => {
    await loadExam();
    await fetchPapers();

    // The open paper's score may have moved too.
    if (selectedPaper) {
      const token = getToken();
      if (token) {
        try {
          const updated = await paperService.get(examId, selectedPaper.paper_id, token);
          setSelectedPaper(updated); setSelectedPaperFull(updated);
        } catch {}
      }
    }

    const bits: string[] = [`Item ${result.question_number} is now "${result.correct_answer}".`];
    if (result.papers_affected === 0) {
      bits.push("No papers have been checked against it yet.");
    } else {
      bits.push(`${result.papers_affected} paper(s) re-checked`);
      if (result.items_flipped > 0)      bits.push(`${result.items_flipped} answer(s) changed`);
      if (result.papers_rescored.length) bits.push(`${result.papers_rescored.length} score(s) updated`);
    }
    // A corrected key can push an item back INTO the review band - that is the
    // point of three-state grading - and a paper that was finished is then
    // unfinished again. Never let that happen quietly.
    const backToReview = result.papers_rescored.filter(p => p.was_checked && !p.now_checked).length;
    if (backToReview > 0) bits.push(`${backToReview} paper(s) need your review again`);

    setToast({ msg: bits.join(" · "), type: backToReview > 0 ? "error" : "success" });
  }, [loadExam, fetchPapers, selectedPaper, examId]);

  // ── One answer on ONE paper corrected ─────────────────────────────────────
  // NEW 2026-11-11. The mirror of handleKeySaved above, and the other half of
  // the same recommendation: that one cascades across every paper, this one
  // touches nothing but the paper in front of her.
  //
  // The server has ALREADY re-graded the item and re-totalled this paper, so
  // nothing is recomputed here - the numbers on screen are stale, they get
  // reloaded, and then what happened is SAID. `result.message` is used rather
  // than a sentence composed here, because the service already decides whether
  // the paper went back to unfinished and that must not be worded twice.
  const handleAnswerChanged = useCallback(async (result: PaperAnswerResult) => {
    await fetchPapers();
    const token = getToken();
    if (token && selectedPaper) {
      try {
        const updated = await paperService.get(examId, selectedPaper.paper_id, token);
        setSelectedPaper(updated); setSelectedPaperFull(updated);
      } catch {}
    }
    // An override CAN send a finished paper back to unfinished - correcting an
    // identification answer into the 0.40-1.0 band does exactly that - so the
    // toast goes red when it does. Same rule as handleKeySaved.
    setToast({ msg: result.message, type: result.is_final ? "success" : "error" });
  }, [fetchPapers, selectedPaper, examId]);

  // Commented on 2026-09-4:
  // ── Generate answer key ───────────────────────────────────────────────────
  // const handleGenerateKey = async () => {
  //   const currentExamPage = examPages[pageIdx];
  //   if (!currentExamPage) return;
  //   const token = getToken();
  //   if (!token) return;
  //   setGeneratingKey(true);
  //   try {
  //     await examService.generateAnswerKey(examId, currentExamPage.page_id, token);
  //     await loadExam();
  //     setToast({ msg: "The exam key has been successfully generated.", type: "success" });
  //   } catch {
  //     setToast({ msg: "We couldn't generate the exam key. Please try again.", type: "error" });
  //   } finally { setGeneratingKey(false); }
  // };
  // ── Generate answer key (open modal) ───────────────────────────────────
  const handleGenerateKey = () => {
    setShowQuestionTypeModal(true);
  };

  // ── Generate answer key with selected type ────────────────────────────
  // Commented on 2026-09-23:
  // const handleGenerateKeyWithType = async (questionType: "true_false" | "encircled") => {
  //   setShowQuestionTypeModal(false);
  //   const currentExamPage = examPages[pageIdx];
  //   if (!currentExamPage) return;
  //   const token = getToken();
  //   if (!token) return;
  //   setGeneratingKey(true);
  //   setSelectedQuestionType(questionType);
  //   try {
  //     await examService.generateAnswerKey(examId, currentExamPage.page_id, token, questionType);
  //     await loadExam();
  //     setToast({ msg: "The exam key has been successfully generated.", type: "success" });
  //   } catch {
  //     setToast({ msg: "We couldn't generate the exam key. Please try again.", type: "error" });
  //   } finally {
  //     setGeneratingKey(false);
  //     setSelectedQuestionType(null);
  //   }
  // };
     const handleGenerateKeyWithType = async (
      questionType: QuestionType,
      expectedItems: number | null = null,
    ) => {
      const currentPage = examPages[pageIdx];
      if (!currentPage) { setShowQuestionTypeModal(false); return; }
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      setGeneratingKey(true);
      setSelectedQuestionType(questionType);
      try {
        const res = await examService.generateAnswerKey(
          examId, currentPage.page_id, token, questionType, expectedItems);
        await loadExam();
        await fetchPapers();   // checked papers are reset when the key changes
        setToast({
          msg: res.warning ? `${res.message} ${res.warning}` : res.message,
          type: res.warning ? "error" : "success",
        });
      } catch (e: unknown) {
        setToast({ msg: e instanceof Error ? e.message : "We couldn't generate the exam key. Please try again.", type: "error" });
      } finally {
        setGeneratingKey(false);
        setSelectedQuestionType(null);
        setShowQuestionTypeModal(false);   // close AFTER it finishes, so the spinner shows
      }
    };

  // ── Page nav ──────────────────────────────────────────────────────────────
  // FIX 2026-11-01. The API does not promise an order for these, and on exam
  // 18 it returned page_number 2 first. Everything else on this screen reads
  // examPages[pageIdx].page_number - the image, the Generate dialog, the
  // "answer(s) on page N" footer - so those three agreed with each other and
  // the pager below, which printed pageIdx + 1, did not. The label read
  // "Page 1 of 2" above the sheet holding items 21-40.
  //
  // paper_pages is sorted for the same reason: currentPaperPage is taken at
  // the SAME pageIdx, so an unsorted paper would put the student's page 2
  // beside the exam's page 1.
  const examPages  = (exam?.pages ?? [])
    .slice().sort((a, b) => a.page_number - b.page_number);
  const paperPages = (selectedPaperFull?.paper_pages ?? [])
    .slice().sort((a, b) => a.page_number - b.page_number);
  const totalPages = Math.max(examPages.length, 1);

  const goPage = (dir: 1 | -1) => {
    setPageIdx(i => Math.min(Math.max(0, i + dir), examPages.length - 1));
    setExamImgErr(false); setPaperImgErr(false);
  };

  const currentExamPage  = examPages[pageIdx];
  const currentPaperPage = paperPages[pageIdx];

  // FIX 2026-09-22: show only the answers of the page being viewed
  const currentPageKeys = (exam?.answer_keys ?? [])
    .filter(ak => !currentExamPage || ak.page_id == null || ak.page_id === currentExamPage.page_id)
    .slice()
    .sort((a, b) => a.question_number - b.question_number);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span className="spinner spinner-dark" />
        <span style={{ color: "var(--text-muted)" }}>Loading exam…</span>
      </main>
    </div>
  );

  if (loadError || !exam) return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div className="alert alert-error" role="alert">{loadError ?? "Exam not found."}</div>
        <Button variant="secondary" onClick={() => router.push("/exams")}>← Back to Exams</Button>
      </main>
    </div>
  );

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <button className="btn-icon" onClick={() => router.push("/exams")} aria-label="Back" style={{ color: "var(--navy)" }}>
            <IconBack />
          </button>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 700, color: "var(--navy)", flex: 1, textAlign: "center" }}>
            {exam.exam_name}
          </h1>
        </div>

        {/* NEW 2026-11-04 (Doc Rubrica, consultation): Subject and Schedule, her
            "2 additional Fields in Exam Info Table".

            Both rows are ALWAYS shown, with an em dash when the value is null.
            Hiding the block when both are empty - which is what a `(exam.subject
            || exam.schedule) &&` guard does - is wrong here: the 7 exams created
            before the migration have NULL in both, so the teacher would see no
            Subject anywhere on this screen, click Edit Exam to change something
            else, and be stopped by "Subject is required." on a field they never
            knew the exam had. The dash is what tells them it exists and is not
            filled in yet. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 2rem",
                      marginBottom: "1rem", fontSize: "0.85rem" }}>
          <span>
            <span style={{ color: "var(--text-muted)" }}>Subject: </span>
            <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.subject ?? "—"}</span>
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>Schedule: </span>
            <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.schedule ?? "—"}</span>
          </span>
        </div>

        {exam.description && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            {exam.description}
          </p>
        )}

        {/* ── Exam section ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Exam</p>
          <Button variant="secondary" onClick={() => router.push(`/exams/${examId}/edit`)} style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}>
            Edit Exam
          </Button>
        </div>

        {/* Side-by-side viewer */}
        <div className="page-viewer">
          <div className="page-viewer-slot">
            {currentExamPage && !examImgErr ? (
              <img src={imgUrl(currentExamPage.image_path)} alt={`Exam page ${currentExamPage.page_number}`}
                onError={() => setExamImgErr(true)}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {examPages.length === 0 ? "No pages uploaded" : "Page unavailable"}
              </span>
            )}
          </div>
          <div className="page-viewer-slot" style={{ flexDirection: "column", gap: "0.5rem" }}>
            {loadingPaper ? (
              <span className="spinner spinner-dark" aria-label="Loading paper…" />
            ) : selectedPaperFull && currentPaperPage && !paperImgErr ? (
              <>
                <img src={imgUrl(currentPaperPage.image_path)} alt={`Paper page ${currentPaperPage.page_number}`}
                  onError={() => setPaperImgErr(true)}
                  style={{ maxWidth: "100%", maxHeight: "90%", objectFit: "contain" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{selectedPaper?.student_name}</span>
              </>
            ) : selectedPaper ? (
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem" }}>
                {paperImgErr ? "Image unavailable" : "No pages for this paper"}<br />
                <span style={{ fontSize: "0.78rem" }}>{selectedPaper.student_name}</span>
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Select test paper to check</span>
            )}
          </div>
        </div>

        {/* Page nav */}
        <div className="page-nav">
          <button className="btn-icon" onClick={() => goPage(-1)} disabled={pageIdx === 0} aria-label="Previous page"><IconLeft /></button>
          {/* the page's OWN number, not its position in the array - see the
              sort above. They agree once sorted, and this stays correct if a
              page is ever missing from the middle. */}
          <span>Page {examPages[pageIdx]?.page_number ?? pageIdx + 1} of {totalPages}</span>
          <button className="btn-icon" onClick={() => goPage(1)} disabled={pageIdx >= examPages.length - 1} aria-label="Next page"><IconRight /></button>
          {selectedPaper && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
              {selectedPaper.student_name}
            </span>
          )}
        </div>

        {/* ── Answer Key section ── */}
        <p className="section-title">Answer Key</p>
        <div className="page-viewer" style={{ marginBottom: "1.5rem" }}>
            <div className="page-viewer-slot" style={{ alignItems: currentPageKeys.length ? "flex-start" : "center", padding: currentPageKeys.length ? "1rem" : 0, overflowY: "auto" }}>
            {/* CHANGED 2026-11-11. The grid, the "N answer(s) on page N" line,
                Regenerate and the Generate fallback all moved into
                AnswerKeyPanel, which adds the inline edit. Nothing about this
                slot's layout changed - the panel renders the same two shapes
                this block did. */}
            <AnswerKeyPanel
              examId={examId}
              keys={currentPageKeys}
              pageNumber={examPages[pageIdx]?.page_number ?? 1}
              canGenerate={!!currentExamPage}
              generating={generatingKey}
              onGenerate={handleGenerateKey}
              onSaved={handleKeySaved}
              onError={msg => setToast({ msg, type: "error" })}
            />
          </div>
          {/* <div className="page-viewer-slot" style={{ flexDirection: "column", gap: "0.75rem" }}>
            {selectedPaperFull && (selectedPaperFull.paper_scores ?? []).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.1rem 2rem", width: "100%", padding: "1rem", overflowY: "auto" }}>
                {(selectedPaperFull.paper_scores ?? []).slice().sort((a, b) => a.question_number - b.question_number).map(s => (
                  <div key={s.score_id} style={{ fontSize: "0.82rem", padding: "0.1rem 0", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span style={{ color: "var(--text-muted)", minWidth: 24 }}>{s.question_number}.</span>
                    <span style={{ fontWeight: 600, color: s.is_correct ? "var(--success)" : "var(--error)" }}>
                      {s.student_answer}
                    </span>
                  </div>
                ))}
              </div> */}
            <div className="page-viewer-slot" style={{ alignItems: selectedPaperFull && (selectedPaperFull.paper_scores ?? []).length > 0 ? "flex-start" : "center", padding: selectedPaperFull && (selectedPaperFull.paper_scores ?? []).length > 0 ? "1rem" : 0, overflowY: "auto" }}>
            {selectedPaperFull && (selectedPaperFull.paper_scores ?? []).length > 0 ? (
              /* CHANGED 2026-11-11. Two things this grid got wrong:
                   1. the colour came from `s.is_correct`, which is FALSE for an
                      item under REVIEW - so a pending item was painted the same
                      red as a wrong one, and the teacher had no way to tell
                      "the scanner is unsure" from "the student got it wrong";
                   2. nothing here was editable, so a letter item the scanner
                      read confidently and wrongly could not be corrected by
                      anybody - the 2026-10-24 "silent lost mark".
                 AnswerTable's grid layout renders the same two columns, the
                 same gap and the same numbering; the answer is now a button
                 and the colour comes from `verdict`. */
              <AnswerTable
                examId={examId}
                paperId={selectedPaperFull.paper_id}
                scores={selectedPaperFull.paper_scores ?? []}
                onChanged={handleAnswerChanged}
                layout="grid"
              />
            ) : selectedPaper ? (
              <Button variant="primary" onClick={handleCheckPaper} loading={checking} disabled={checking} style={{ width: "auto", padding: "0.65rem 1.5rem" }}>
                {checking ? "Checking…" : "Check Paper"}
              </Button>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Select test paper to check</span>
            )}
          </div>
        </div>

        {/* ── Test Papers section ── */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {downloadError && (
              <span role="alert" style={{ fontSize: "0.75rem", color: "var(--error)", maxWidth: 280, lineHeight: 1.25 }}>
                {downloadError}
              </span>
            )}
            {/* NEW 2026-11-12 (Alex & Bancud, page 2 item 6: "Results: Export ->
                to Excel"). Leftmost and SECONDARY so the two paper-adding
                buttons keep their order and "Add paper" keeps the rightmost,
                orange, most-reached-for slot it has today. */}
            <Button variant="secondary" onClick={handleDownloadExcel} disabled={downloading}
                    style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}>
              {downloading ? "Preparing…" : "Download Excel"}
            </Button>
            {/* NEW 2026-11-12 (Alex & Bancud, page 2 item 7). SECONDARY styling
                and placed FIRST, so "Add paper" keeps the emphasis it has
                today: the batch is the faster path for a whole section, but
                adding one paper is still what a teacher reaches for most. */}
            <Button variant="secondary" onClick={() => setShowBatchUpload(true)} style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}>
              Upload class papers
            </Button>
            <Button variant="secondary" onClick={() => setShowAddPaper(true)} style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem", borderColor: "var(--orange)", color: "var(--orange)" }}>
              Add paper
            </Button>
          </div>

        {/* CHANGED 2026-11-11 - `totalItems` is the denominator for "score as
            X/Y"; the alphabetical sort is on by default inside the table.
            `exam` is non-null here: the `if (loadError || !exam)` guard above
            returns before this point. */}
        <PapersTable
          papers={papers}
          selectedPaperId={selectedPaper?.paper_id ?? null}
          onSelect={handleSelectPaper}
          onEdit={handleEditPaper}
          onDelete={handleDeleteRequest}
          totalItems={exam.answer_keys?.length ?? null}
        />

        {/* ── Delete confirm dialog ── */}
        {deletingPaper && (
          <ConfirmDialog
            title="Delete Test Paper"
            message={`You are about to delete test paper "${deletingPaper.student_name}". Are you sure you want to continue?`}
            confirmLabel={deleting ? "Deleting…" : "Yes"}
            cancelLabel="No"
            onConfirm={handleDeleteConfirmed}
            onCancel={() => setDeletingPaper(null)}
            dangerous
          />
        )}

        {/* ── Modals ── */}
        {showAddPaper && (
          <AddEditPaperModal
            examId={examId}
            examPages={examPages.length || 1}
            onClose={() => setShowAddPaper(false)}
            onSuccess={handlePaperAdded}
          />
        )}

        {/* NEW 2026-11-12. Mounted only while open, so the roster and the
            exam's paper list are fetched fresh each time rather than going
            stale behind a hidden dialog. */}
        {showBatchUpload && (
          <BatchUploadModal
            examId={examId}
            onClose={() => setShowBatchUpload(false)}
            onFinished={handleBatchFinished}
          />
        )}

        {editingPaper && (
          <EditPaperModal
            paper={editingPaper}
            examId={examId}
            examPages={examPages.length || 1}
            onClose={() => setEditingPaper(null)}
            onSuccess={handleEditSuccess}
          />
        )}
        {/* Commented on 2026-09-23 */}
        {/* Question Type Modal
        <QuestionTypeModal
          isOpen={showQuestionTypeModal}
          onClose={() => setShowQuestionTypeModal(false)}
          onSelect={handleGenerateKeyWithType}
          loading={generatingKey}
        /> */}
        <QuestionTypeModal
          isOpen={showQuestionTypeModal}
          pageNumber={examPages[pageIdx]?.page_number}
          onClose={() => { if (!generatingKey) setShowQuestionTypeModal(false); }}
          onSelect={handleGenerateKeyWithType}
          loading={generatingKey}
        />
        {/* Toast */}
        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </main>
    </div>
  );
}