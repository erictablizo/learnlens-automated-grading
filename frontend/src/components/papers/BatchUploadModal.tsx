"use client";
/**
 * components/papers/BatchUploadModal.tsx
 * ======================================
 * NEW 2026-11-12 — "Batch upload -> of Exam" (Alex Passion / Julius Bancud,
 * post-UAT page 2, item 7), resting on item 4: "ID Student # -> file of Test
 * Exam".
 *
 * Pick the photos, see which student each one matched, upload. 35 students in
 * one screen instead of 35 modal cycles — the THROUGHPUT-2026-10-23 finding
 * that "forty students is forty modal cycles. Nothing batches, nothing runs in
 * the background, and there is no progress indicator across papers."
 *
 * THREE DECISIONS, each measured elsewhere:
 *
 * 1. THE LOOP IS IN THE BROWSER, one student at a time. 35 files at ~2 MB is a
 *    70 MB request; nginx limits and timeouts make that a bad bet, and a
 *    per-student loop gives progress and keeps one failure from losing the
 *    other 34.
 *
 * 2. IT DOES NOT CHECK THE PAPERS. Measured: 40.1 s per paper page, so 35
 *    students is ~23 minutes. Checking stays its own step with its own
 *    progress; bundling it here would produce a dialog that looks frozen for
 *    twenty minutes with no safe point to stop.
 *
 * 3. EVERYTHING IS DECIDED BEFORE ANYTHING IS SENT. `planUpload` reads the
 *    match AND the exam's existing papers, so "already has a paper" is a line
 *    in the preview rather than a surprise 409 at student 12 of 35.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
import { studentService } from "@/services/studentService";
import { getToken } from "@/lib/auth";
import {
  matchFilesToStudents, planUpload, toUpload, planSummary,
  outcomeSummary, allSucceeded,
  type RosterEntry, type UploadPlanEntry, type UploadOutcome,
} from "@/lib/paperFiles";

type Step = "pick" | "uploading" | "done";

interface Props {
  examId: number;
  onClose: () => void;
  /** Called once at the end so the exam page can reload its paper list. */
  onFinished: (summary: string, clean: boolean) => void;
}

export default function BatchUploadModal({ examId, onClose, onFinished }: Props) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [taken, setTaken] = useState<ReadonlySet<number>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<Step>("pick");
  const [doneCount, setDoneCount] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [outcomes, setOutcomes] = useState<UploadOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Set when the teacher presses Stop. Read between students, so a stop never
  // interrupts a paper half-way through its own pages.
  const stopped = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoadError("Your session has expired. Sign in again."); return; }
    Promise.all([studentService.list(token), paperService.list(examId, token)])
      .then(([students, papers]) => {
        setRoster(students.map(s => ({
          student_id: s.student_id, student_number: s.student_number,
          last_name: s.last_name, first_name: s.first_name,
        })));
        // Which roster students already have a paper here. Needs student_id on
        // PaperListResponse (added 2026-11-12); without it this set is empty
        // and every clash becomes a 409 mid-run instead of a preview line.
        setTaken(new Set(papers
          .map(p => p.student_id)
          .filter((id): id is number => typeof id === "number")));
      })
      .catch(() => setLoadError("Could not load the roster for this exam."));
  }, [examId]);

  const match = useMemo(
    () => matchFilesToStudents(files, roster ?? []),
    [files, roster],
  );
  const plan = useMemo(() => planUpload(match, taken), [match, taken]);
  const queue = useMemo(() => toUpload(plan), [plan]);

  const pick = (list: FileList | null) => {
    setError(null);
    setOutcomes([]);
    setStep("pick");
    setFiles(list ? Array.from(list) : []);
  };

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) { setError("Your session has expired. Sign in again."); return; }
    stopped.current = false;
    setStep("uploading");
    setDoneCount(0);
    const results: UploadOutcome[] = [];

    for (const entry of queue) {
      if (stopped.current) break;
      setCurrent(`${entry.student.last_name}, ${entry.student.first_name}`);

      let paperId: number | null = null;
      let pagesUploaded = 0;
      try {
        const paper = await paperService.createForStudent(
          examId, entry.student.student_number, token);
        paperId = paper.paper_id;
      } catch (e: unknown) {
        results.push({
          student: entry.student, ok: false, pagesUploaded: 0,
          pagesTotal: entry.files.length,
          error: e instanceof Error ? e.message : "Could not create the paper.",
        });
        setOutcomes([...results]);
        setDoneCount(results.length);
        continue;
      }

      // Pages one at a time, in page order. A failure here leaves a paper with
      // SOME pages - which outcomeSummary counts as a problem, not a success,
      // because grading it would score against missing pages.
      let pageError: string | undefined;
      for (const f of entry.files) {
        try {
          await paperService.uploadPage(examId, paperId, f.page, f.file, token);
          pagesUploaded += 1;
        } catch (e: unknown) {
          pageError = e instanceof Error ? e.message : "A page failed to upload.";
          break;
        }
      }

      results.push({
        student: entry.student,
        ok: pageError === undefined,
        pagesUploaded,
        pagesTotal: entry.files.length,
        error: pageError,
      });
      setOutcomes([...results]);
      setDoneCount(results.length);
    }

    setCurrent("");
    setStep("done");
    const summary = outcomeSummary(results);
    onFinished(summary, allSucceeded(results));
  }, [queue, examId, onFinished]);

  const busy = step === "uploading";

  return (
    <Modal title="Upload papers for a whole class" onClose={busy ? () => {} : onClose}>
      {loadError && (
        <div role="alert" className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
          {loadError}
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      {step === "pick" && (
        <>
          <label className="form-label" htmlFor="batch-files">
            Choose the photos
          </label>
          <input
            id="batch-files"
            className="form-input"
            type="file"
            multiple
            accept="image/*"
            disabled={roster === null}
            onChange={e => { pick(e.target.files); e.target.value = ""; }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.3rem 0 1rem" }}>
            Name each photo after the student number written on the paper —
            <code> 2021-00123.jpg</code>. For a two-page paper add the page:
            <code> 2021-00123_p1.jpg</code>, <code>2021-00123_p2.jpg</code>.
            {roster !== null && ` ${roster.length} student(s) on your roster.`}
          </p>
        </>
      )}

      {files.length > 0 && step !== "done" && (
        <>
          <p className="section-title" style={{ marginBottom: "0.3rem" }}>
            {step === "uploading" ? "Uploading" : "What will happen"}
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            {step === "uploading"
              ? `${doneCount} of ${queue.length} done${current ? ` — ${current}` : ""}`
              : planSummary(plan, match.unmatched.length)}
          </p>

          <div className="table-wrapper" style={{ maxHeight: 240, overflowY: "auto" }}>
            <table aria-label="Papers to upload">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Student No.</th>
                  <th>Student</th>
                  <th>Files</th>
                  <th style={{ width: 150 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(entry => (
                  <PlanRow key={entry.student.student_id} entry={entry}
                           outcome={outcomes.find(o => o.student.student_id === entry.student.student_id)} />
                ))}
                {match.unmatched.map(u => (
                  <tr key={u.file.name} style={{ background: "var(--error-bg)" }}>
                    <td style={{ color: "var(--text-muted)" }}>—</td>
                    <td style={{ color: "var(--text-muted)" }}>Not recognised</td>
                    <td style={{ fontSize: "0.78rem" }}>{u.file.name}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--error)" }}>{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <div role="status" aria-live="polite"
               className={`alert ${allSucceeded(outcomes) ? "alert-success" : "alert-error"}`}
               style={{ marginBottom: "0.75rem" }}>
            {outcomeSummary(outcomes)}
          </div>
          {outcomes.some(o => !o.ok || o.pagesUploaded < o.pagesTotal) && (
            <ul style={{ margin: "0 0 0.8rem", paddingLeft: "1.1rem", fontSize: "0.78rem" }}>
              {outcomes.filter(o => !o.ok || o.pagesUploaded < o.pagesTotal).map(o => (
                <li key={o.student.student_id} style={{ color: "var(--error)" }}>
                  {o.student.last_name}, {o.student.first_name} —{" "}
                  {o.error ?? `only ${o.pagesUploaded} of ${o.pagesTotal} page(s) uploaded`}
                </li>
              ))}
            </ul>
          )}
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            The papers are in but NOT checked yet. Checking runs the scanner over
            every page and takes about a minute each, so it is a separate step.
          </p>
        </>
      )}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
        {step === "uploading" ? (
          <Button variant="secondary" onClick={() => { stopped.current = true; }}>
            Stop after this one
          </Button>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {step === "done" ? "Close" : "Cancel"}
          </Button>
        )}
        {step === "pick" && (
          <Button variant="primary" onClick={run}
                  disabled={queue.length === 0 || roster === null}>
            {queue.length === 0
              ? "Nothing to upload"
              : `Upload ${queue.length} paper${queue.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function PlanRow({ entry, outcome }: { entry: UploadPlanEntry; outcome?: UploadOutcome }) {
  const skipped = entry.action === "skip";
  let status: string;
  let colour = "var(--text-muted)";
  if (outcome) {
    if (!outcome.ok) { status = outcome.error ?? "Failed"; colour = "var(--error)"; }
    else if (outcome.pagesUploaded < outcome.pagesTotal) {
      status = `Only ${outcome.pagesUploaded} of ${outcome.pagesTotal} page(s)`;
      colour = "var(--error)";
    } else { status = "Uploaded"; colour = "var(--success)"; }
  } else if (skipped) {
    status = entry.reason ?? "Skipped";
    colour = "var(--warning, #b7791f)";
  } else {
    status = "Ready";
  }
  return (
    <tr style={{ background: skipped ? "var(--orange-light)" : undefined }}>
      <td style={{ fontWeight: 600, color: "var(--navy)" }}>
        {entry.student.student_number}
      </td>
      <td>{entry.student.last_name}, {entry.student.first_name}</td>
      <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
        {entry.files.map(f => `p${f.page}`).join(", ")} ({entry.files.length})
      </td>
      <td style={{ fontSize: "0.75rem", color: colour }}>{status}</td>
    </tr>
  );
}