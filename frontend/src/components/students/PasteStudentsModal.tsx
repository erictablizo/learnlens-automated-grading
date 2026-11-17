"use client";
/**
 * components/students/PasteStudentsModal.tsx
 * ==========================================
 * NEW 2026-11-12 — paste a class list, SEE it parsed, fix it, then add it.
 *
 * This is how a 35-student section gets entered once instead of 35 times.
 *
 * THE PREVIEW IS THE FEATURE. `lib/studentPaste.ts` is deliberately a
 * best-effort parser — "2021-00125, Smith, Jr., John" cannot be split
 * correctly by any rule, because nothing in the text says whether "Jr."
 * belongs to the surname or the given name. So the parse is shown in an
 * editable table and the teacher corrects two cells, rather than a clever
 * parser guessing wrong silently across 35 rows.
 *
 * Nothing is sent until she presses Add.
 *
 * CHANGED 2026-11-14 — a MIDDLE NAME column (Alex Passion / Julius Bancud,
 * Recommendations page 1), and `knownSections` is now passed to the parser.
 * That second part is not cosmetic: it is what stops a list pasted the week
 * before as "number, last, first, BSCS 3A" from reading "BSCS 3A" as a middle
 * name. See pickColumns() in lib/studentPaste.ts.
 *
 * CHANGED 2026-11-15 (Grace, post-UAT) — two things, and only one of them is
 * a rule:
 *
 *   WORDING. Every "Middle Initial" and "M.I." here now says MIDDLE NAME, and
 *   the example shows "Reyes" rather than "R". The field has always stored a
 *   name; the label was describing how it is usually written, not what it
 *   holds. Nothing about what is accepted changed - "R" is still legal and
 *   middleInitial() still renders it as "R." inside a composed name.
 *
 *   THE SECTION IS REQUIRED. Every row must end up with one, from its own
 *   column or from the box above. That is a real change: a list pasted
 *   yesterday with no section column and an empty box now flags every row.
 */
import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { studentService } from "@/services/studentService";
import type { StudentBulkResult } from "@/types/student";
import {
  parseStudentPaste, withIssues, submittableRows, parseSummary,
  type ParsedRow,
} from "@/lib/studentPaste";
import { getToken } from "@/lib/auth";
// NEW 2026-11-15 — the Section box gets the same rule the rows get.
import { checkSection } from "@/lib/textField";

interface Props {
  /** Pre-fills the section box; the roster screen passes its current filter. */
  defaultSection?: string;
  knownSections: string[];
  onClose: () => void;
  onAdded: (result: StudentBulkResult) => void;
}

// CHANGED 2026-11-15: full middle names, and every line carries one, because
// the example is the format most lists will be typed to match.
const EXAMPLE = `2021-00000123, Cruz, Ana, Reyes
2021-00000124, Dela Cruz, Jose, Pascual
2021-00000125, Santos, Maria, Lim`;

export default function PasteStudentsModal({
  defaultSection = "", knownSections, onClose, onAdded,
}: Props) {
  const [text, setText] = useState("");
  const [section, setSection] = useState(defaultSection);
  const [edited, setEdited] = useState<ParsedRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-parsed on every keystroke. Cheap - it is a split over at most a few
  // hundred short lines - and it means the table reacts as she types rather
  // than behind a "Preview" button she might not press.
  //
  // CHANGED 2026-11-14: knownSections goes in. It is only used to decide what
  // a FOURTH column means when there is no header row - see studentPaste.ts.
  const parsed = useMemo(
    () => parseStudentPaste(text, section, knownSections),
    [text, section, knownSections],
  );

  // NEW 2026-11-15. The box's OWN message, shown under it.
  //
  // It is checked as OPTIONAL even though a section is required, and that is
  // deliberate: a list whose rows each name their own section does not need
  // this box filled at all. What is required is that every ROW ends up with
  // one, which the preview enforces row by row. This only catches a box that
  // has been filled with something unusable.
  const sectionError = checkSection(section);

  // `edited` holds her corrections once she has made any; until then the table
  // shows the parse. Re-flagged through withIssues so fixing a duplicate on
  // line 7 clears the warning on line 22 immediately.
  const rows = edited ?? parsed.rows;
  const ready = submittableRows(rows);
  const blocked = rows.length - ready.length;

  const editCell = (line: number, field: keyof ParsedRow, value: string) => {
    const next = (edited ?? parsed.rows).map(r =>
      r.line === line ? { ...r, [field]: value } : r);
    setEdited(withIssues(next));
  };

  const handleTextChange = (v: string) => {
    setText(v);
    // Her edits belonged to the previous parse; keeping them would silently
    // graft old corrections onto new rows.
    setEdited(null);
    setError(null);
  };

  const handleAdd = async () => {
    const token = getToken();
    if (!token) { setError("Your session has expired. Sign in again."); return; }
    if (sectionError) { setError(sectionError); return; }
    if (ready.length === 0) { setError("There is nothing ready to add yet."); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await studentService.bulk(
        ready.map(r => ({
          student_number: r.student_number,
          last_name: r.last_name,
          first_name: r.first_name,
          // CHANGED 2026-11-15: both are required now, and a row in `ready`
          // has passed both rules, so neither `|| null` branch is reachable.
          // Sending null for a required field would be a 422 the teacher
          // cannot act on.
          middle_name: r.middle_name,
          section: r.section,
        })),
        section.trim() || undefined,
        token,
      );
      onAdded(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add that list.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add a class list" onClose={onClose}>
      {error && (
        <div role="alert" aria-live="assertive" className="alert alert-error"
             style={{ marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      {/* CHANGED 2026-11-15. No longer "(optional)" - a row without a section
          of its own takes this one, and a row with neither is refused. */}
      <label className="form-label" htmlFor="paste-section">
        Section <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
      </label>
      <input
        id="paste-section"
        className="form-input"
        list="known-sections"
        value={section}
        onChange={e => { setSection(e.target.value); setEdited(null); setError(null); }}
        placeholder="e.g. BSCS 3A"
        aria-invalid={!!sectionError}
        style={sectionError ? { borderBottomColor: "var(--error)" } : undefined}
      />
      <datalist id="known-sections">
        {knownSections.map(s => <option key={s} value={s} />)}
      </datalist>
      {sectionError ? (
        <p role="alert" style={{ fontSize: "0.75rem", color: "var(--error)",
                                 margin: "0.2rem 0 0.9rem" }}>
          {sectionError}
        </p>
      ) : (
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.2rem 0 0.9rem" }}>
          Used for any row that does not carry its own section. Every student
          needs one, so leave this filled unless your list has a section column.
        </p>
      )}

      <label className="form-label" htmlFor="paste-box">
        One student per line — student number, last name, first name, middle name
      </label>
      <textarea
        id="paste-box"
        className="form-input"
        rows={7}
        value={text}
        onChange={e => handleTextChange(e.target.value)}
        placeholder={EXAMPLE}
        style={{ fontFamily: "monospace", fontSize: "0.82rem", resize: "vertical" }}
      />
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.2rem 0 0.9rem" }}>
        You can paste straight from a spreadsheet — a header row is skipped
        automatically, and when it names its columns they are matched by name
        rather than by position. The middle name is required. Check the table
        below before adding; names with a comma in them, like “Smith, Jr.”, may
        need a correction.
      </p>

      {rows.length > 0 && (
        <>
          <p className="section-title" style={{ marginBottom: "0.3rem" }}>
            Preview
          </p>
          {/* The summary also says how the FOURTH column was read, which is
              the one thing about this parse that changed on 2026-11-14. */}
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            {parseSummary({ ...parsed, rows })}
          </p>

          <div className="table-wrapper" style={{ maxHeight: 260, overflowY: "auto" }}>
            <table aria-label="Students to add">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Line</th>
                  <th style={{ width: 130 }}>Student No.</th>
                  <th>Last Name</th>
                  <th>First Name</th>
                  <th style={{ width: 110 }}>Middle Name</th>
                  <th style={{ width: 120 }}>Section</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const bad = r.issues.length > 0;
                  return (
                    <tr key={r.line}
                        style={{ background: bad ? "var(--error-bg)" : undefined }}>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                        {r.line}
                      </td>
                      {(["student_number", "last_name", "first_name",
                         "middle_name", "section"] as const)
                        .map(field => (
                          <td key={field}>
                            <input
                              className="form-input"
                              value={r[field]}
                              onChange={e => editCell(r.line, field, e.target.value)}
                              aria-label={`${field.replace("_", " ")} on line ${r.line}`}
                              style={{ padding: "0.15rem 0.35rem", fontSize: "0.8rem" }}
                            />
                          </td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {blocked > 0 && (
            <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem",
                         fontSize: "0.78rem", color: "var(--error)" }}>
              {rows.filter(r => r.issues.length > 0).map(r => (
                <li key={r.line}>Line {r.line}: {r.issues.join(" ")}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end",
                    marginTop: "1rem" }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleAdd}
          loading={saving}
          disabled={saving || ready.length === 0 || !!sectionError}
        >
          {/* Says exactly what will happen. "Add 33 students" next to two red
              rows is clearer than a disabled button with no explanation. */}
          {ready.length === 0
            ? "Nothing to add yet"
            : `Add ${ready.length} student${ready.length === 1 ? "" : "s"}` +
              (blocked > 0 ? ` (${blocked} skipped)` : "")}
        </Button>
      </div>
    </Modal>
  );
}