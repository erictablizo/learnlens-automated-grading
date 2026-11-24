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
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
// The SAME rules the exam form applies to these two fields, and the same two
// schemas/_text.py applies on the server. A teacher types a subject into both
// screens; two rules would drift.
import { checkSubject, checkSection } from "@/lib/textField";
// NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3, fifth revision.
import { advanceOnEnter, makeFieldCheck } from "@/lib/formNav";
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
  /* NEW 2026-11-24 — the Create New block, which is the only part of this
   * dialog Enter walks. The dropdown above belongs to the other radio and
   * is not a box she types in. */
  const newRef = useRef<HTMLDivElement | null>(null);

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
    /* CHANGED 2026-11-24 — checkSchedule -> checkSection.

    THE OPEN QUESTION IN THIS COMMENT IS ANSWERED, and the answer is no:
    checkSchedule enforces LENGTH AND CHARACTERS, not a day/time shape, so
    "BSCS 1B" was never going to be refused. What it does instead is say
    "Schedule is required." under a box labelled Section — seen on
    learnlens.tech — and accept "---" as a section.

    checkSection has existed since 2026-11-15 and NOTHING CALLED IT. It says
    the right word and refuses "---". MEASURED over 8 section-shaped values
    and 6 legacy day/time ones: the two functions agree on everything
    section-shaped, and differ only on the COLON. */
    const t = checkSection(schedule, true);
    if (t) { setLocal(t); return; }
    setLocal(null);
    // Tidied, not raw: the rules collapse whitespace, so "English101  " and
    // "English101" must not become two lists.
    onCreate(subject.replace(/\s+/g, " ").trim(),
             schedule.replace(/\s+/g, " ").trim());
  };

  /* NEW 2026-11-24 — requirement 3, FIFTH revision:
   *
   *   "Apply validation if you click enter in the first box and it's blank,
   *    and contains special characters, that when the validaition appears,
   *    once first box has been entered with info then it will proceed to
   *    second box, apply it as well in the succeeding input box"
   *
   * Enter USED TO RUN proceed() FROM EITHER BOX. That validated, so a blank
   * Subject was caught — but a VALID Subject did not move the cursor to
   * Section; it ran the whole dialog and complained about the box below.
   * Her sentence says the cursor proceeds. Now it does, and Enter from the
   * last box still runs proceed(), which is what the caller does when
   * advanceOnEnter returns false.
   *
   * THE SAME TWO FUNCTIONS proceed() uses, against the same `local` slot. */
  const fieldCheck = useMemo(() => makeFieldCheck({
    "cl-subject": { check: checkSubject, show: setLocal },
    "cl-section": { check: v => checkSection(v, true), show: setLocal },
  }), []);

  const shown = local ?? error;

  return (
    <Modal title="Select Option" onClose={onCancel}>
      {/* CHANGED 2026-11-23 — Ms. Melanie, page 18 requirement 4. */}
      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem",
                  margin: "-0.75rem 0 1.1rem" }}>
        Choose the subject and section you are working with.
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
              : "Select a subject and section…"}
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
      <div
        ref={newRef}
        style={{ marginLeft: "1.6rem", marginBottom: "1.4rem" }}
        /* NEW 2026-11-24 — requirement 3, fifth revision. One handler on the
           block, not one per box: advanceOnEnter needs to see both boxes to
           know which is next. On the LAST box it returns false and Proceed
           runs, which is what Enter did from both boxes before. */
        onKeyDown={e => {
          if (!advanceOnEnter(e, newRef.current, ".form-input", fieldCheck)) {
            if (e.key === "Enter") { e.preventDefault(); proceed(); }
          }
        }}
      >
        <label className="form-label" htmlFor="cl-subject">Subject Name</label>
        <input
          ref={subjectRef}
          id="cl-subject"
          className="form-input"
          value={subject}
          disabled={mode !== "new"}
          placeholder="English101"
          onChange={e => { setSubject(e.target.value); setLocal(null); }}
        />
        {/* CHANGED 2026-11-23 — Ms. Melanie, page 18 requirement 4, her
            words: "Under List of Students (in the Side Bar): Instead of
            schedule gawin nalang per block like comsci 1, comsci 2,
            comsci 3."

            CORRECTED 2026-11-24: this used to quote her as writing "we will
            use 'Section' instead of 'Schedule'". She never wrote that
            sentence. The word "Section" comes from her requirement 8, which
            says to replace "Schedule: <schedule info>" with
            "Section: <Section Name>" — so the LABEL is right, but it is
            requirement 8's word, not requirement 4's, and her example of the
            content is "comsci 1", not a day and time.

            THE LABEL AND THE EXAMPLE CHANGE; THE WIRE DOES NOT, YET. `schedule`
            is still the state, still onCreate's second argument, still
            ClassList.schedule and still the column. Renaming any of those on
            their own sends `section` to an API that wants `schedule`. The
            column rename is one migration plus about a dozen files and it
            lands as a SINGLE push — see PAGE18-MELANIE-2026-11-23.md.

            ANSWERED AND ACTED ON 2026-11-24. This used to say "still calls
            checkSchedule() - if that enforces a day/time shape, a section
            name will be refused". It does not: checkSchedule tests length
            and characters only, so "BSCS 3A" was never at risk. The real
            defect was the WORD - a box labelled Section answering
            "Schedule is required.", seen on learnlens.tech - and that
            checkSchedule accepts "---" as a section. This box now calls
            checkSection(), which has existed since 2026-11-15 and which
            nothing called. See measure/2026-11-24_section_rule.mjs. */}
        <label className="form-label" htmlFor="cl-section"
               style={{ marginTop: "0.6rem" }}>
          Section
        </label>
        <input
          id="cl-section"
          className="form-input"
          value={schedule}
          disabled={mode !== "new"}
          placeholder="BSCS 1B"
          onChange={e => { setSchedule(e.target.value); setLocal(null); }}
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