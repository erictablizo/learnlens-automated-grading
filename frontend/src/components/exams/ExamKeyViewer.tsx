"use client";
import type { SVGProps } from "react";
import { AnswerKey } from "@/types/exam";
import Button from "@/components/ui/Button";

const IconRefresh = (props: SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface Props {
  answerKeys: AnswerKey[];
  examId: number;
  /** FIX 2026-09-22: when given, only the answers of THIS page are shown
   *  (the old viewer showed every page's answers under each page). */
  pageId?: number;
  onRegenerate: () => void;
  isRegenerating?: boolean;
  warning?: string | null;   // e.g. "Only 11 of 12 expected answers were detected."
}

const pct = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : `${Math.min(100, Math.round(Number(c) * 100))}%`;

const label = (a: string) => (a === "T" ? "T (True)" : a === "F" ? "F (False)" : a);

export default function ExamKeyViewer({ answerKeys, pageId, onRegenerate, isRegenerating = false, warning }: Props) {
  const keys = (answerKeys ?? [])
    .filter(ak => pageId === undefined || ak.page_id === undefined || ak.page_id === null || ak.page_id === pageId)
    .slice()
    .sort((a, b) => a.question_number - b.question_number);

  if (keys.length === 0) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-sm)", padding: "2rem",
        textAlign: "center", border: "1px solid var(--border)" }}>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>No answer key generated yet.</p>
        <Button variant="primary" onClick={onRegenerate} loading={isRegenerating}
          style={{ width: "auto", padding: "0.6rem 1.5rem" }}>
          Generate Answer Key
        </Button>
      </div>
    );
  }

  const avg = keys.reduce((s, ak) => s + Number(ak.ocr_confidence || 0), 0) / keys.length;
  const low = keys.filter(ak => ak.ocr_confidence !== null && Number(ak.ocr_confidence) < 0.5).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>Answer Key</h3>
        <Button variant="secondary" onClick={onRegenerate} loading={isRegenerating}
          style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}>
          <IconRefresh style={{ marginRight: "0.3rem" }} />
          Regenerate
        </Button>
      </div>

      {warning && (
        <div role="status" className="alert alert-error" style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
          {warning} Check the answers below, or regenerate with the correct number of items.
        </div>
      )}

      <div className="table-wrapper">
        <table aria-label="Answer key">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Q#</th>
              <th>Answer</th>
              <th style={{ width: 90 }}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(ak => {
              const lowConf = ak.ocr_confidence !== null && Number(ak.ocr_confidence) < 0.5;
              return (
                <tr key={ak.answer_key_id}>
                  <td style={{ fontWeight: 600, color: "var(--orange)" }}>{ak.question_number}</td>
                  <td style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--navy)", letterSpacing: "0.05em" }}>
                    {label(ak.correct_answer)}
                  </td>
                  <td style={{ fontSize: "0.82rem", color: lowConf ? "var(--error, #dc2626)" : "var(--text-muted)" }}
                    title={lowConf ? "Low confidence — please double-check this answer" : undefined}>
                    {pct(ak.ocr_confidence)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", marginTop: "1rem", padding: "0.75rem 1rem",
        background: "var(--bg)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem" }}>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Total Questions: </span>
          <strong style={{ color: "var(--navy)" }}>{keys.length}</strong>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Avg Confidence: </span>
          <strong style={{ color: "var(--navy)" }}>{Math.round(avg * 100)}%</strong>
        </div>
        {low > 0 && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>Needs checking: </span>
            <strong style={{ color: "var(--error, #dc2626)" }}>{low}</strong>
          </div>
        )}
      </div>
    </div>
  );
}