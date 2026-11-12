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

interface Props {
  /** Pre-fills the section box; the roster screen passes its current filter. */
  defaultSection?: string;
  knownSections: string[];
  onClose: () => void;
  onAdded: (result: StudentBulkResult) => void;
}

const EXAMPLE = `2021-00123, Cruz, Ana
2021-00124, Dela Cruz, Jose
2021-00125, Santos, Maria`;

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
  const parsed = useMemo(
    () => parseStudentPaste(text, section),
    [text, section],
  );

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
    if (ready.length === 0) { setError("There is nothing ready to add yet."); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await studentService.bulk(
        ready.map(r => ({
          student_number: r.student_number,
          last_name: r.last_name,
          first_name: r.first_name,
          section: r.section || null,
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

      <label className="form-label" htmlFor="paste-section">Section (optional)</label>
      <input
        id="paste-section"
        className="form-input"
        list="known-sections"
        value={section}
        onChange={e => { setSection(e.target.value); setEdited(null); }}
        placeholder="e.g. BSCS 3A"
      />
      <datalist id="known-sections">
        {knownSections.map(s => <option key={s} value={s} />)}
      </datalist>
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.2rem 0 0.9rem" }}>
        Used for any row that does not carry its own section.
      </p>

      <label className="form-label" htmlFor="paste-box">
        One student per line — student number, last name, first name
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
        automatically. Check the table below before adding; names with a comma
        in them, like “Smith, Jr.”, may need a correction.
      </p>

      {rows.length > 0 && (
        <>
          <p className="section-title" style={{ marginBottom: "0.3rem" }}>
            Preview
          </p>
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
                      {(["student_number", "last_name", "first_name", "section"] as const)
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
          disabled={saving || ready.length === 0}
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