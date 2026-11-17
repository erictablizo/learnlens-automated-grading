"use client";
/**
 * components/students/ClassListPickerModal.tsx
 * ============================================
 * NEW 2026-11-17 — Recommendations page 7.
 *
 *   "Select Option
 *      View Existing List of Students (Subject Name and Schedule)
 *        Then select in the Dropdown List (Subject Name and Schedule)
 *      Create New List of Students (Subject Name and Schedule)
 *      Cancel Button          Proceed Button"
 *   "Subject Name:  <Example English101>
 *    Schedule (Day and Time):  <Example MWF 7:30AM to 9:30AM>"
 *
 * SectionPickerModal's twin, one page later: page 5 asked the same question
 * about a SECTION, page 7 asks it about a SUBJECT and SCHEDULE. Not shared
 * with it, because the two differ in every part that matters - two fields
 * instead of one, a different rule on each, and a dropdown of objects rather
 * than strings - and a component with a mode flag doing both would be harder
 * to read than either.
 *
 * What IS shared is the shell: <Modal> owns the backdrop, the blur, Escape,
 * the backdrop click, role="dialog", the title and the close button. That is
 * the lesson from 2026-11-16, when this component's twin hand-rolled all six
 * and drifted visibly from every other dialog in the system.
 */
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
// The SAME rules the exam form applies to these two fields, and the same two
// schemas/_text.py applies on the server. A teacher types a subject into both
// screens; two rules would drift.
import { checkSubject, checkSchedule } from "@/lib/textField";
import type { ClassList } from "@/types/classList";

type Mode = "existing" | "new";

export default function ClassListPickerModal({
  lists,
  loading,
  onCancel,
  onPickExisting,
  onCreate,
  busy,
  error,
}: {
  lists: ClassList[];
  loading: boolean;
  onCancel: () => void;
  onPickExisting: (list: ClassList) => void;
  onCreate: (subject: string, schedule: string) => void;
  /** True while a create is in flight, so Proceed cannot be double-fired. */
  busy: boolean;
  /** A message from the server — a 409 for a list that already exists. */
  error: string | null;
}) {
  const [mode, setMode] = useState<Mode>("existing");
  const [chosen, setChosen] = useState("");
  const [subject, setSubject] = useState("");
  const [schedule, setSchedule] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  const selectRef = useRef<HTMLSelectElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  // With no lists yet there is nothing to view, so the only live path is
  // creating one. Leaving "View Existing" selected and empty would be a
  // dialog whose Proceed can never be satisfied.
  const noneYet = !loading && lists.length === 0;
  useEffect(() => { if (noneYet) setMode("new"); }, [noneYet]);

  useEffect(() => {
    if (mode === "new") subjectRef.current?.focus();
    else selectRef.current?.focus();
  }, [mode]);

  const proceed = () => {
    if (busy) return;
    if (mode === "existing") {
      const list = lists.find(l => String(l.class_list_id) === chosen);
      if (!list) { setLocal("Choose a list from the dropdown."); return; }
      setLocal(null);
      onPickExisting(list);
      return;
    }
    const s = checkSubject(subject);
    if (s) { setLocal(s); return; }
    const t = checkSchedule(schedule);
    if (t) { setLocal(t); return; }
    setLocal(null);
    // Tidied, not raw: the rules collapse whitespace, so "English101  " and
    // "English101" must not become two lists.
    onCreate(subject.replace(/\s+/g, " ").trim(),
             schedule.replace(/\s+/g, " ").trim());
  };

  const shown = local ?? error;

  return (
    <Modal title="Select Option" onClose={onCancel}>
      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem",
                  margin: "-0.75rem 0 1.1rem" }}>
        Choose the subject and schedule you are working with.
      </p>

      {shown && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: "0.8rem" }}>
          {shown}
        </div>
      )}

      {/* ── View Existing ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                    marginBottom: "0.35rem" }}>
        <input
          type="radio" id="cl-existing" name="class-list-mode"
          checked={mode === "existing"} disabled={noneYet}
          onChange={() => { setMode("existing"); setLocal(null); }}
        />
        <label htmlFor="cl-existing" className="form-label"
               style={{ margin: 0, cursor: noneYet ? "not-allowed" : "pointer",
                        opacity: noneYet ? 0.55 : 1 }}>
          View Existing List of Students
        </label>
      </div>
      <div style={{ marginLeft: "1.6rem", marginBottom: "1rem" }}>
        <select
          ref={selectRef}
          className="form-input"
          value={chosen}
          disabled={mode !== "existing" || loading || noneYet}
          aria-label="Existing list of students"
          onChange={e => { setChosen(e.target.value); setLocal(null); }}
        >
          <option value="">
            {loading ? "Loading…"
              : noneYet ? "No lists yet — create one below"
              : "Select a subject and schedule…"}
          </option>
          {lists.map(l => (
            <option key={l.class_list_id} value={String(l.class_list_id)}>
              {l.subject} / {l.schedule} ({l.student_count})
            </option>
          ))}
        </select>
      </div>

      {/* ── Create New ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                    marginBottom: "0.35rem" }}>
        <input
          type="radio" id="cl-new" name="class-list-mode"
          checked={mode === "new"}
          onChange={() => { setMode("new"); setLocal(null); }}
        />
        <label htmlFor="cl-new" className="form-label"
               style={{ margin: 0, cursor: "pointer" }}>
          Create New List of Students
        </label>
      </div>
      <div style={{ marginLeft: "1.6rem", marginBottom: "1.4rem" }}>
        <label className="form-label" htmlFor="cl-subject">Subject Name</label>
        <input
          ref={subjectRef}
          id="cl-subject"
          className="form-input"
          value={subject}
          disabled={mode !== "new"}
          placeholder="English101"
          onChange={e => { setSubject(e.target.value); setLocal(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); proceed(); } }}
        />
        <label className="form-label" htmlFor="cl-schedule"
               style={{ marginTop: "0.6rem" }}>
          Schedule (Day and Time)
        </label>
        <input
          id="cl-schedule"
          className="form-input"
          value={schedule}
          disabled={mode !== "new"}
          placeholder="MWF 7:30AM to 9:30AM"
          onChange={e => { setSchedule(e.target.value); setLocal(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); proceed(); } }}
        />
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)",
                    margin: "0.25rem 0 0", lineHeight: 1.35 }}>
          You can add students to it on the next screen.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}
                style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
          Cancel
        </Button>
        <Button variant="primary" onClick={proceed} loading={busy} disabled={busy}
                style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
          Proceed
        </Button>
      </div>
    </Modal>
  );
}
