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
 * 2. IT CAN CHECK THE PAPERS, and says what that costs. CHANGED 2026-11-19
 *    (Sir Alex: "Check All Papers (per group) during upload -> checking (at
 *    the same time)", and his point 2, "Progress Bar").
 *
 *    The 2026-11-12 decision NOT to check here was made on a measurement -
 *    40.1 s per paper page, so 35 students is ~23 minutes - and that
 *    measurement has not changed. What changed is the objection: the dialog
 *    would "look frozen for twenty minutes with no safe point to stop". So it
 *    now has a progress bar, a per-student stage, and a Stop that skips the
 *    pending check rather than waiting it out. The box is ticked by default
 *    because that is what was asked for, and the estimate is printed beside
 *    it so twenty minutes is a choice rather than a surprise.
 *
 * 3. EVERYTHING IS DECIDED BEFORE ANYTHING IS SENT. `planUpload` reads the
 *    match AND the exam's existing papers, so "already has a paper" is a line
 *    in the preview rather than a surprise 409 at student 12 of 35.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { paperService } from "@/services/paperService";
// CHANGED 2026-11-17 — the roster is built from this teacher's CLASS LISTS,
// not from GET /students, which returns only students they created and is
// therefore empty since the global-students migration. See classListRoster().
import { classListService } from "@/services/classListService";
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

/**
 * Every student on THIS TEACHER'S class lists, de-duplicated by student_id.
 *
 * NEW 2026-11-17. Filename matching needs a LIST, and GET /students/lookup
 * deliberately cannot enumerate — GLOBAL-STUDENTS-2026-11-17.md: "It cannot
 * list, search or enumerate." Widening it, or adding a teacher-visible
 * all-students endpoint, would hand every teacher the whole school roster and
 * reverse that decision. A teacher's own class lists are the set they are
 * entitled to and the set an exam is actually for.
 *
 * ONE REQUEST PER LIST. A teacher has a handful, so the N+1 is a handful.
 * If that ever stops being true, the fix is a members endpoint that takes
 * several ids, not a wider roster.
 *
 * A student on two lists appears ONCE: `byId` keeps the first and skips the
 * rest, so a student taking two of this teacher's subjects cannot produce two
 * rows and two papers from one photo.
 */

/** What came back from checking one paper, or why it could not be checked. */
interface CheckInfo {
  correct?:     number;
  total?:       number;
  isFinal?:     boolean;
  needsReview?: number;
  error?:       string;
}

/** Measured 2026-10-23, THROUGHPUT-2026-10-23. The number the 2026-11-12
 *  decision was made on, and the one printed beside the checkbox. */
const SECONDS_PER_PAGE = 40.1;

/** Never 0 — "about 0 minutes" beside a checkbox reads as "instant". */
const checkMinutes = (queue: UploadPlanEntry[]): number =>
  Math.max(1, Math.round(
    queue.reduce((n, e) => n + e.files.length, 0) * SECONDS_PER_PAGE / 60));

async function classListRoster(token: string): Promise<RosterEntry[]> {
  const lists = await classListService.list(token);
  const details = await Promise.all(
    lists.map(l => classListService.get(l.class_list_id, token)));
  const byId = new Map<number, RosterEntry>();
  for (const d of details) {
    for (const s of d.students) {
      if (byId.has(s.student_id)) continue;
      byId.set(s.student_id, {
        student_id:     s.student_id,
        student_number: s.student_number,
        last_name:      s.last_name,
        first_name:     s.first_name,
      });
    }
  }
  return Array.from(byId.values());
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
    // NEW 2026-11-19. Ticked by default; the cost is printed beside it.
  const [checkAfter, setCheckAfter] = useState(true);
  /** Which half of one student's work is running, for the line under the bar. */
  const [stage, setStage] = useState<"upload" | "check">("upload");
  /** Check results by student_id. Deliberately NOT folded into UploadOutcome:
   *  a paper that uploaded and then failed to CHECK is uploaded, and
   *  outcomeSummary must go on counting it a success. Measured —
   *  measure/2026-11-19_batch_check.mjs, part 3. */
  const [checks, setChecks] = useState<Record<number, CheckInfo>>({});

  // Set when the teacher presses Stop. Read between students, so a stop never
  // interrupts a paper half-way through its own pages.
  const stopped = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoadError("Your session has expired. Sign in again."); return; }
    Promise.all([classListRoster(token), paperService.list(examId, token)])
    .then(([students, papers]) => {
        setRoster(students);
        // Which roster students already have a paper here. Needs student_id on
        // PaperListResponse (added 2026-11-12); without it this set is empty
        // and every clash becomes a 409 mid-run instead of a preview line.
        setTaken(new Set(papers
          .map(p => p.student_id)
          .filter((id): id is number => typeof id === "number")));
      })
      .catch(() => setLoadError("Could not load your class lists."));
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
    setChecks({});
    setStep("pick");
    setFiles(list ? Array.from(list) : []);
  };

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) { setError("Your session has expired. Sign in again."); return; }
    stopped.current = false;
    setStep("uploading");
    setDoneCount(0);
    setChecks({});
    const results: UploadOutcome[] = [];

    for (const entry of queue) {
      if (stopped.current) break;
      const sid = entry.student.student_id;
      setCurrent(`${entry.student.last_name}, ${entry.student.first_name}`);
      setStage("upload");

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

      // NEW 2026-11-19. Here, between the pages and the result, so the
      // ordering is forced: a check can only run after that paper's last page
      // is up, and always before the next student is created. Measured —
      // measure/2026-11-19_batch_check.mjs, part 1.
      //
      // THREE GUARDS, each for a different wrong outcome:
      //   pageError === undefined  grading a paper with a missing page scores
      //                            the student against blanks.
      //   !stopped.current         the teacher pressed Stop while these pages
      //                            were going up. The pages finish - never a
      //                            half paper - but the ~40s check is skipped,
      //                            so Stop takes effect now rather than in a
      //                            minute.
      //   checkAfter               the box is unticked: byte-identical to the
      //                            2026-11-12 loop.
      if (checkAfter && pageError === undefined && !stopped.current) {
        setStage("check");
        try {
          const g = await paperService.grade(examId, paperId, token);
          setChecks(prev => ({ ...prev, [sid]: {
            correct: g.correct, total: g.total_items,
            isFinal: g.is_final, needsReview: g.needs_review } }));
        } catch (e: unknown) {
          // A CHECK failure is NOT an upload failure. The paper is on the
          // server; calling the upload failed would send the teacher to
          // re-upload it, and the duplicate guard would answer 409.
          setChecks(prev => ({ ...prev, [sid]: {
            error: e instanceof Error ? e.message : "Checking failed." } }));
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
    setStage("upload");
    setStep("done");
    const summary = outcomeSummary(results);
    onFinished(summary, allSucceeded(results));
  }, [queue, examId, onFinished, checkAfter]);

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
            <code> 2021-00000123.jpg</code>. For a two-page paper add the page:
            <code> 2021-00000123_p1.jpg</code>, <code>2021-00000123_p2.jpg</code>.
            {roster !== null && roster.length > 0 &&
              ` ${roster.length} student(s) across your class lists.`}
              </p>
              {roster !== null && roster.length === 0 && (
                <div role="status" className="alert alert-error"
                style={{ marginBottom: "1rem", fontSize: "0.82rem" }}>
                  You have no students on any class list yet, so no photo can be
                  matched. Build a list under <strong>List of Students</strong>
                  {" "}first — add each student by their number.
                  </div>
                )}

          {/* NEW 2026-11-19 (Sir Alex: "Check All Papers (per group) during
              upload"). Only once photos are chosen, so the estimate below has
              a real number of papers to quote. */}
          {files.length > 0 && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem",
                            fontSize: "0.82rem", color: "var(--navy)",
                            margin: "0 0 1rem", cursor: "pointer" }}>
              <input type="checkbox" checked={checkAfter} style={{ marginTop: "0.2rem" }}
                     onChange={e => setCheckAfter(e.target.checked)} />
              <span>
                <strong>Check each paper as it is uploaded.</strong>{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  Checking runs the scanner over every page and takes about 40
                  seconds a page — roughly {checkMinutes(queue)} minute(s) for
                  these {queue.length} paper(s). You can stop part-way; anything
                  already uploaded stays, and unchecked papers can be checked
                  one at a time afterwards.
                </span>
              </span>
            </label>
          )}
                </>
              )}

      {files.length > 0 && step !== "done" && (
        <>
          <p className="section-title" style={{ marginBottom: "0.3rem" }}>
            {step === "uploading" ? "Uploading" : "What will happen"}
          </p>
          {step === "uploading" ? (
            <>
              {/* NEW 2026-11-19 — his point 2. A bar rather than a bare count,
                  because the slow half is now the checking and a number that
                  does not move for forty seconds reads as a hang. */}
              <div role="progressbar" aria-valuemin={0} aria-valuemax={queue.length}
                   aria-valuenow={doneCount} aria-label="Papers finished"
                   style={{ height: 8, borderRadius: 4, background: "var(--border)",
                            overflow: "hidden", margin: "0 0 0.4rem" }}>
                <div style={{
                  height: "100%",
                  width: `${queue.length ? (doneCount / queue.length) * 100 : 0}%`,
                  background: "var(--orange)", transition: "width 0.3s",
                }} />
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                {doneCount} of {queue.length} done
                {current && (
                  <> — {stage === "check" ? "checking" : "uploading"} <strong>{current}</strong></>
                )}
                {stage === "check" && (
                  <span style={{ color: "var(--orange)" }}> (about 40s a page)</span>
                )}
              </p>
            </>
          ) : (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              {planSummary(plan, match.unmatched.length)}
            </p>
          )}

          <div className="table-wrapper" style={{ maxHeight: 240, overflowY: "auto" }}>
            <table aria-label="Papers to upload">
              <thead>
                                {/* CHANGED 2026-11-17: Files is capped and Status widened.
                    In auto table layout a `width` is only a suggestion, so an
                    unmatched row's long file name was holding the Files column
                    open and squeezing Status to about 90px — the one column a
                    teacher reads when something goes wrong, stacked one word
                    per line. Capping Files is what actually frees the space. */}
                <tr>
                  <th style={{ width: 110 }}>Student No.</th>
                  <th>Student</th>
                  <th style={{ width: 150 }}>Files</th>
                  <th style={{ width: 210 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(entry => (
                  <PlanRow key={entry.student.student_id} entry={entry}
                           outcome={outcomes.find(o => o.student.student_id === entry.student.student_id)}
                           check={checks[entry.student.student_id]} />
                ))}
                {match.unmatched.map(u => (
                  <tr key={u.file.name} style={{ background: "var(--error-bg)" }}>
                    <td style={{ color: "var(--text-muted)" }}>—</td>
                    <td style={{ color: "var(--text-muted)" }}>Not recognised</td>
                    <td style={{ fontSize: "0.78rem", wordBreak: "break-word" }}>
                      {u.file.name}
                    </td>
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
            {checkAfter
              ? "Papers marked Checked have been scored. Any that could not be " +
                "checked are uploaded and can be checked one at a time from the " +
                "exam page — nothing needs re-uploading."
              : "The papers are in but NOT checked yet. Checking runs the scanner " +
                "over every page and takes about 40 seconds a page, so it is a " +
                "separate step."}
          </p>
        </>
      )}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
        {step === "uploading" ? (
          <Button variant="secondary" onClick={() => { stopped.current = true; }}>
            Stop after this paper
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

function PlanRow({ entry, outcome, check }: {
  entry: UploadPlanEntry; outcome?: UploadOutcome; check?: CheckInfo;
}) {
  const skipped = entry.action === "skip";
  let status: string;
  let colour = "var(--text-muted)";
  if (outcome) {
    if (!outcome.ok) { status = outcome.error ?? "Failed"; colour = "var(--error)"; }
    else if (outcome.pagesUploaded < outcome.pagesTotal) {
      status = `Only ${outcome.pagesUploaded} of ${outcome.pagesTotal} page(s)`;
      colour = "var(--error)";
    } else if (check?.error) {
      // Uploaded, not checked. AMBER, not red: nothing needs re-uploading.
      status = `Uploaded — not checked: ${check.error}`;
      colour = "var(--warning, #b7791f)";
    } else if (check && check.correct !== undefined) {
      status = check.isFinal
        ? `Checked — ${check.correct} / ${check.total}`
        : `Checked — ${check.correct} / ${check.total}, ${check.needsReview} for review`;
      colour = "var(--success)";
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