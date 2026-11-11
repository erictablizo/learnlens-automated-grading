"use client";
/**
 * NEW 2026-11-11 — the Subject / Schedule / Exam Name dialog, extracted.
 *
 * Doc Rubrica asks for the same three-box picker on the new Data Analytics
 * page that the Summary Report already has: "Choose Subject, Schedule and
 * Exam Name (3 Details needed)".
 *
 * This is a COPY of the dialog living inside app/reports/page.tsx, lifted into
 * a component so the two screens cannot drift apart. The Summary Report has
 * NOT been changed to import it — that page is working and signed off, and
 * touching it to save a duplication is not worth the risk this week. When
 * convenient, delete ExamPickerDialog from reports/page.tsx and import this
 * instead; the props are identical.
 */
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Exam } from "@/types/exam";

const ANY = "";   // the "All" option value on both filter dropdowns

/** Distinct, case-insensitively de-duplicated, alphabetical. */
function distinct(values: (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }));
}

const eq = (a: string | null, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export interface ExamPickerProps {
  exams:   Exam[];
  /** The exam already on screen, so reopening starts where it left off. */
  current: number | null;
  /** Wording of the confirm button — "Create" on the report, "Show" here. */
  confirmLabel?: string;
  title?: string;
  onPick:  (examId: number) => void;
  onClose: () => void;
}

export default function ExamPicker({
  exams, current, confirmLabel = "Show", title = "Choose an exam", onPick, onClose,
}: ExamPickerProps) {
  const start = exams.find(e => e.exam_id === current) ?? null;
  const [subject,  setSubject]  = useState(start?.subject  ?? ANY);
  const [schedule, setSchedule] = useState(start?.schedule ?? ANY);
  const [examId,   setExamId]   = useState<number | null>(current);
  const [error,    setError]    = useState<string | null>(null);

  const subjects  = useMemo(() => distinct(exams.map(e => e.subject)),  [exams]);
  const schedules = useMemo(() => distinct(exams.map(e => e.schedule)), [exams]);

  // Exam Name is the THIRD box and narrows with the two above it.
  const visible = useMemo(
    () => exams.filter(e =>
      (subject  === ANY || eq(e.subject,  subject)) &&
      (schedule === ANY || eq(e.schedule, schedule))),
    [exams, subject, schedule],
  );

  // Drop a selection that falls outside the narrowed list, so the <select>
  // never holds a value with no matching option — the trap Create Exam hit on
  // 2026-10-23 with value={12} against options 1..10.
  useEffect(() => {
    if (examId !== null && !visible.some(e => e.exam_id === examId)) setExamId(null);
  }, [visible, examId]);

  const handlePick = () => {
    if (examId === null) { setError("Choose an exam first."); return; }
    onPick(examId);
  };

  return (
    <Modal title={title} onClose={onClose}>
      {error && (
        <div role="alert" className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>
      )}

      <label className="form-label" htmlFor="an-subject">Subject</label>
      <select
        id="an-subject" className="dropdown" value={subject}
        onChange={e => { setSubject(e.target.value); setError(null); }}
        style={{ width: "100%", marginBottom: "1rem" }}
      >
        <option value={ANY}>All subjects</option>
        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="form-label" htmlFor="an-schedule">Schedule</label>
      <select
        id="an-schedule" className="dropdown" value={schedule}
        onChange={e => { setSchedule(e.target.value); setError(null); }}
        style={{ width: "100%", marginBottom: "1rem" }}
      >
        <option value={ANY}>All schedules</option>
        {schedules.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="form-label" htmlFor="an-exam">Exam Name</label>
      <select
        id="an-exam" className="dropdown" value={examId ?? ""}
        onChange={e => { setExamId(e.target.value === "" ? null : Number(e.target.value)); setError(null); }}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      >
        <option value="">Select an exam…</option>
        {visible.map(e => <option key={e.exam_id} value={e.exam_id}>{e.exam_name}</option>)}
      </select>

      {visible.length === 0 && exams.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
          No exam matches that subject and schedule.
        </p>
      )}
      {exams.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
          You have not created any exams yet.
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary" onClick={handlePick} disabled={examId === null}
          style={{ width: "auto", padding: "0.65rem 1.75rem" }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}