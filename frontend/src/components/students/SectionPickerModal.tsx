"use client";
/**
 * components/students/SectionPickerModal.tsx
 * ==========================================
 * NEW 2026-11-16 — Recommendations page 5.
 *
 *   "Under Teacher Access Page: Upon Clicking Student (in Side Bar):
 *    Pop-view the message window:
 *      Select Option
 *      View Existing Section:  Show Drop-down List of Existing Section
 *      Create New Section
 *      Cancel Button            Proceed Button"
 *
 * REWRITTEN 2026-11-16, same day, to use <Modal>.
 *
 * The first version hand-rolled its own backdrop - rgba(16,32,56,0.45) with no
 * blur - and its own Escape handler, backdrop click, role="dialog",
 * aria-modal, <h2> title and close button. components/ui/Modal.tsx already
 * does every one of those, and globals.css gives .modal-backdrop a
 * `backdrop-filter: blur(2px)` that the hand-rolled one did not have. Grace
 * spotted it immediately: beside the Data Analytics dialog, which goes through
 * <Modal>, this one left the whole roster legible behind it.
 *
 * So roughly sixty lines came OUT of this file. The lesson is the ordinary
 * one: the house already had a modal, and a component that reimplements the
 * shell cannot help but drift from it.
 *
 * IT RENDERS ON THE STUDENTS PAGE, NOT ON THE SIDEBAR CLICK, and that is a
 * deliberate difference from the literal wording. The sidebar entry is a plain
 * <Link href="/students"> (Navbar.tsx:452), so intercepting the click would
 * mean teaching the sidebar about this screen's state - and it would still not
 * fire for a reload, a bookmark, or a typed URL, each of which would drop the
 * teacher onto the unfiltered roster. Mounting the modal with the page covers
 * every route in, and leaves the Navbar untouched.
 *
 * SHOWN TO EVERYONE, teacher and admin alike (Grace, 2026-11-16).
 *
 * NOTHING IS WRITTEN HERE. "Create New Section" does not create a record,
 * because a section IS NOT A RECORD: it is a text column on students, and
 * studentService.sections() returns the distinct values in use. So a new name
 * becomes real when the first student is saved into it, and until then it
 * exists only as this screen's title and the pre-filled Section box.
 */
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
// The SAME rule the Section box on the roster uses, and the same rule
// check_section() applies on the server - letters, numbers, space and
// . , ( ) - with at least one letter or number. A name accepted here cannot
// be refused when the first student is saved into it.
import { checkSection } from "@/lib/textField";

type Mode = "existing" | "new";

export default function SectionPickerModal({
  sections,
  loading,
  onCancel,
  onProceed,
}: {
  sections: string[];
  loading: boolean;
  onCancel: () => void;
  onProceed: (section: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("existing");
  const [existing, setExisting] = useState("");
  const [created, setCreated] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectRef = useRef<HTMLSelectElement | null>(null);
  const newRef = useRef<HTMLInputElement | null>(null);

  // With no sections yet there is nothing to view, so the only live path is
  // creating one. Leaving "View Existing Section" selected and empty would be
  // a dialog whose Proceed button can never be satisfied.
  const noneYet = !loading && sections.length === 0;
  useEffect(() => { if (noneYet) setMode("new"); }, [noneYet]);

  // Moves focus to whichever control the chosen mode made live. On MOUNT this
  // runs before <Modal>'s own effect, which then focuses the dialog container
  // itself - that is Modal's behaviour and it is left alone. This matters for
  // the later switches, when the teacher picks the other radio.
  useEffect(() => {
    if (mode === "new") newRef.current?.focus();
    else selectRef.current?.focus();
  }, [mode]);

  // NO Escape handler, NO backdrop click, NO role="dialog"/aria-modal, NO
  // <h2> title and NO close button here: Modal.tsx owns all six.

  const proceed = () => {
    if (mode === "existing") {
      if (!existing) { setError("Choose a section from the list."); return; }
      setError(null);
      onProceed(existing);
      return;
    }
    const msg = checkSection(created, true);
    if (msg) { setError(msg); return; }
    setError(null);
    // The tidied value, not the raw one - checkSection collapses whitespace,
    // so "BSCS  3A" and "BSCS 3A" must not become two different sections.
    onProceed(created.replace(/\s+/g, " ").trim());
  };

  return (
    <Modal title="Select Option" onClose={onCancel}>
      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem",
                  margin: "-0.75rem 0 1.1rem" }}>
        Choose the section you are working with. You can change it afterwards.
      </p>

      {error && (
        <div className="alert alert-error" role="alert"
             style={{ marginBottom: "0.8rem" }}>
          {error}
        </div>
      )}

      {/* ── View Existing Section ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                    marginBottom: "0.35rem" }}>
        <input
          type="radio"
          id="pick-existing"
          name="section-mode"
          checked={mode === "existing"}
          disabled={noneYet}
          onChange={() => { setMode("existing"); setError(null); }}
        />
        <label htmlFor="pick-existing" className="form-label"
               style={{ margin: 0, cursor: noneYet ? "not-allowed" : "pointer",
                        opacity: noneYet ? 0.55 : 1 }}>
          View Existing Section
        </label>
      </div>
      <div style={{ marginLeft: "1.6rem", marginBottom: "1rem" }}>
        <select
          ref={selectRef}
          className="form-input"
          value={existing}
          disabled={mode !== "existing" || loading || noneYet}
          aria-label="Existing section"
          onChange={e => { setExisting(e.target.value); setError(null); }}
        >
          <option value="">
            {loading ? "Loading…"
              : noneYet ? "No sections yet — create one below"
              : "Select a section…"}
          </option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Create New Section ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                    marginBottom: "0.35rem" }}>
        <input
          type="radio"
          id="pick-new"
          name="section-mode"
          checked={mode === "new"}
          onChange={() => { setMode("new"); setError(null); }}
        />
        <label htmlFor="pick-new" className="form-label"
               style={{ margin: 0, cursor: "pointer" }}>
          Create New Section
        </label>
      </div>
      <div style={{ marginLeft: "1.6rem", marginBottom: "1.4rem" }}>
        <input
          ref={newRef}
          className="form-input"
          value={created}
          disabled={mode !== "new"}
          placeholder="BSCS 3A"
          aria-label="New section name"
          onChange={e => { setCreated(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); proceed(); } }}
        />
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)",
                    margin: "0.25rem 0 0", lineHeight: 1.35 }}>
          The section is saved with the first student you add to it.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
        <Button variant="secondary" onClick={onCancel}
                style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
          Cancel
        </Button>
        <Button variant="primary" onClick={proceed}
                style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
          Proceed
        </Button>
      </div>
    </Modal>
  );
}
