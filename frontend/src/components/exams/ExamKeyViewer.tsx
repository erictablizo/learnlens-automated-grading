"use client";
import type { SVGProps } from "react";
import { AnswerKey } from "@/types/exam";
import Button from "@/components/ui/Button";

// const IconRefresh = () => (
//   <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
//     <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
//   </svg>
// );
const IconRefresh = (props: SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface Props {
  answerKeys: AnswerKey[];
  examId: number;
  pageId: number;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export default function ExamKeyViewer({
  answerKeys,
  examId,
  pageId,
  onRegenerate,
  isRegenerating = false,
}: Props) {
  if (!answerKeys || answerKeys.length === 0) {
    return (
      <div style={{
        background: "var(--surface)",
        borderRadius: "var(--radius-sm)",
        padding: "2rem",
        textAlign: "center",
        border: "1px solid var(--border)",
      }}>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          No answer key generated yet.
        </p>
        <Button
          variant="primary"
          onClick={onRegenerate}
          loading={isRegenerating}
          style={{ width: "auto", padding: "0.6rem 1.5rem" }}
        >
          Generate Answer Key
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "1rem",
      }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>Answer Key</h3>
        <Button
          variant="secondary"
          onClick={onRegenerate}
          loading={isRegenerating}
          style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}
        >
          <IconRefresh style={{ marginRight: "0.3rem" }} />
          Regenerate
        </Button>
      </div>

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
            {answerKeys.map((ak) => (
              <tr key={ak.answer_key_id}>
                <td style={{ fontWeight: 600, color: "var(--orange)" }}>
                  {ak.question_number}
                </td>
                <td style={{
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  color: "var(--navy)",
                  letterSpacing: "0.05em",
                }}>
                  {ak.correct_answer}
                </td>
                <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {ak.ocr_confidence !== null && ak.ocr_confidence !== undefined
                    ? `${(ak.ocr_confidence * 100).toFixed(0)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex",
        gap: "1.5rem",
        marginTop: "1rem",
        padding: "0.75rem 1rem",
        background: "var(--bg)",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.85rem",
      }}>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Total Questions: </span>
          <strong style={{ color: "var(--navy)" }}>{answerKeys.length}</strong>
        </div>
        {answerKeys.length > 0 && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>Avg Confidence: </span>
            <strong style={{ color: "var(--navy)" }}>
              {(
                (answerKeys.reduce((sum, ak) => sum + (ak.ocr_confidence || 0), 0) /
                  answerKeys.length) *
                100
              ).toFixed(0)}%
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}