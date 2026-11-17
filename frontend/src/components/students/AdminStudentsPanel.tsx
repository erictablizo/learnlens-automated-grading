"use client";
/**
 * components/students/AdminStudentsPanel.tsx
 * ==========================================
 * NEW 2026-11-17 — Recommendations page 6, the administrator's half.
 *
 *   "For ADMIN Page ONLY: When you click this option "Students" in the side
 *    bar. Remove this Pop-up Page ... Instead display this Page ONLY: Where we
 *    maintain and add Student Number, Last Name First Name, Middle Name and
 *    Section. This the GLOBAL info of Student Info."
 *   "This list reflects the Student Numbers for All students, arranged in
 *    ascending order."
 *
 * A SEPARATE COMPONENT, not a branch inside students/page.tsx. That page is
 * 450 lines of teacher roster with a section picker on it, and threading
 * `isAdmin` through its load, save, delete and title would be six edits in
 * code that works today. This is a new file: it cannot break the teacher's
 * screen, and page.tsx needs one early return.
 *
 * NO SECTION PICKER. Page 6 says "Remove this Pop-up Page" in as many words -
 * the administrator maintains the whole table and has no class to choose.
 *
 * ASCENDING BY NUMBER IS THE SERVER'S JOB. GET /admin/students orders by
 * lower(trim(student_number)), the expression ux_students_number indexes, so
 * "2021-A123" and "2021-a123" sit next to each other. Re-sorting here would
 * be a second opinion about the same question.
 *
 * THE RULES ARE THE TEACHER'S RULES. checkStudentNumber / checkNamePart /
 * checkMiddleName / checkSection, the same four this screen's teacher
 * counterpart uses and the same four schemas/_text.py applies on the server -
 * measured, 56 checks, 0 disagreements. An administrator typing a name is not
 * a different kind of typing.
 */
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { adminService } from "@/services/adminService";
import type { Student, StudentDetail } from "@/types/student";
import { getToken } from "@/lib/auth";
import {
  checkStudentNumber, checkNamePart, checkMiddleName, checkSection,
} from "@/lib/textField";

const IconEdit = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3 1 1-3a4 4 0 01.94-1.414z" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const BLANK = {
  student_number: "", last_name: "", first_name: "", middle_name: "", section: "",
};
type FieldKey = keyof typeof BLANK;

/** The rule travels WITH the box, so a field cannot be added without one. */
const FIELDS: ReadonlyArray<{
  key: FieldKey; label: string; placeholder: string; width: number;
  check: (v: string) => string | null;
}> = [
    { key: "student_number", label: "Student No.", placeholder: "2021-00000123", width: 160,
    check: v => checkStudentNumber(v) },
  { key: "last_name", label: "Last Name", placeholder: "Cruz", width: 170,
    check: v => checkNamePart(v, "Last name") },
  { key: "first_name", label: "First Name", placeholder: "Ana", width: 170,
    check: v => checkNamePart(v, "First name") },
  { key: "middle_name", label: "Middle Name", placeholder: "Reyes", width: 150,
    check: v => checkMiddleName(v, true) },
  { key: "section", label: "Section", placeholder: "BSCS 3A", width: 150,
    check: v => checkSection(v, true) },
];

export default function AdminStudentsPanel() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");

  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<{ student: Student; papers: number } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true); setLoadError(null);
    try {
      setStudents(await adminService.students.list(token, query || undefined));
    } catch {
      setLoadError("Could not load the student list.");
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  /* The section dropdown is derived from the rows already on screen. A
     /admin/students/sections endpoint would be a second query answering a
     question the response in hand already answers. */
  const sections = Array.from(
    new Set(students.map(s => s.section).filter((s): s is string => !!s))
  ).sort((a, b) => a.localeCompare(b));

  const shown = section ? students.filter(s => s.section === section) : students;

  const resetForm = () => {
    setForm({ ...BLANK }); setEditingId(null);
    setFormError(null); setFieldErrors({});
  };

  /** Every box, every time — not first-failure-wins. */
  const validate = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) {
      const msg = f.check(form[f.key]);
      if (msg) next[f.key] = msg;
    }
    setFieldErrors(next);
    const n = Object.keys(next).length;
    setFormError(n === 0 ? null
      : n === 1 ? "One field needs your attention."
      : `${n} fields need your attention.`);
    return n === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const token = getToken();
    if (!token) return;
    setSaving(true); setFormError(null); setNotice(null);
    const body = {
      student_number: form.student_number,
      last_name: form.last_name,
      first_name: form.first_name,
      middle_name: form.middle_name,
      section: form.section,
    };
    try {
      if (editingId === null) {
        await adminService.students.create(body, token);
        setNotice(`${body.last_name}, ${body.first_name} added to the school roster.`);
      } else {
        await adminService.students.update(editingId, body, token);
        setNotice("Student updated.");
      }
      resetForm();
      await load();
    } catch (e: unknown) {
      // A 409 arrives with the server's own sentence on .message, naming who
      // already holds the number. Nothing to compose here.
      setFormError(e instanceof Error ? e.message : "Could not save that student.");
    } finally { setSaving(false); }
  };

  const startEdit = (s: Student) => {
    setEditingId(s.student_id);
    setForm({
      student_number: s.student_number, last_name: s.last_name,
      first_name: s.first_name, middle_name: s.middle_name ?? "",
      section: s.section ?? "",
    });
    setFormError(null); setFieldErrors({}); setNotice(null);
  };

  const askDelete = async (s: Student) => {
    const token = getToken();
    if (!token) return;
    try {
      const detail: StudentDetail = await adminService.students.get(s.student_id, token);
      setDeleting({ student: s, papers: detail.papers_count });
    } catch {
      setDeleting({ student: s, papers: 0 });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const token = getToken();
    if (!token) return;
    setDeleteBusy(true);
    try {
      const result = await adminService.students.remove(deleting.student.student_id, token);
      setDeleting(null);
      setNotice(result.message);
      if (editingId === deleting.student.student_id) resetForm();
      await load();
    } catch (e: unknown) {
      setDeleting(null);
      setLoadError(e instanceof Error ? e.message : "Could not remove that student.");
    } finally { setDeleteBusy(false); }
  };

  return (
    <>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem",
                   fontWeight: 700, color: "var(--navy)", marginBottom: "0.25rem" }}>
        Students
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
        The school-wide student list. Teachers build their class lists from
        these records and cannot change them.
      </p>

      {loadError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
          {loadError}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" role="status" style={{ marginBottom: "1rem" }}>
          {notice}
        </div>
      )}

      <p className="section-title">{editingId === null ? "Add a student" : "Edit student"}</p>
      {formError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: "0.6rem" }}>
          {formError}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap",
                    alignItems: "flex-start", marginBottom: "1.5rem" }}>
        {FIELDS.map(f => (
          <div key={f.key} style={{ flex: `0 1 ${f.width}px` }}>
            <label className="form-label" htmlFor={`a-${f.key}`}>
              {f.label}
              <span aria-hidden="true" style={{ color: "var(--error)" }}> *</span>
            </label>
            <input
              id={`a-${f.key}`}
              className="form-input"
              value={form[f.key]}
              aria-required="true"
              aria-invalid={!!fieldErrors[f.key]}
              style={fieldErrors[f.key] ? { borderBottomColor: "var(--error)" } : undefined}
              onChange={e => {
                const v = e.target.value;
                setForm(p => ({ ...p, [f.key]: v }));
                setFieldErrors(p => (p[f.key] ? { ...p, [f.key]: undefined } : p));
              }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleSave(); } }}
              placeholder={f.placeholder}
            />
            {fieldErrors[f.key] && (
              <p role="alert" style={{ color: "var(--error)", fontSize: "0.72rem",
                                       margin: "0.15rem 0 0", lineHeight: 1.35 }}>
                {fieldErrors[f.key]}
              </p>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.6rem" }}>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}
                  style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
            {editingId === null ? "Add" : "Save"}
          </Button>
          {editingId !== null && (
            <Button variant="secondary" onClick={resetForm} disabled={saving}
                    style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
        <select className="form-input" value={section} style={{ flex: "0 1 180px" }}
                onChange={e => setSection(e.target.value)} aria-label="Filter by section">
          <option value="">All sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="form-input" value={query} style={{ flex: "1 1 220px" }}
               onChange={e => setQuery(e.target.value)}
               placeholder="Search name or number" aria-label="Search the student list" />
      </div>

      <div className="table-wrapper">
        <table aria-label="All students">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Student No.</th>
              <th>Last Name</th>
              <th>First Name</th>
              <th style={{ width: 130 }}>Middle Name</th>
              <th style={{ width: 140 }}>Section</th>
              <th style={{ width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem",
                                           color: "var(--text-muted)" }}>Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem",
                                           color: "var(--text-muted)" }}>
                {query || section ? "No students match that."
                                  : "No students yet. Add the first one above."}
              </td></tr>
            ) : shown.map(s => (
              <tr key={s.student_id}
                  style={{ background: editingId === s.student_id ? "var(--orange-light)" : undefined }}>
                <td style={{ fontWeight: 600, color: "var(--navy)" }}>{s.student_number}</td>
                <td>{s.last_name}</td>
                <td>{s.first_name}</td>
                <td style={{ color: "var(--text-muted)" }}>{s.middle_name ?? "—"}</td>
                <td style={{ color: "var(--text-muted)" }}>{s.section ?? "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    <Button variant="icon" onClick={() => startEdit(s)}
                            aria-label={`Edit ${s.last_name}, ${s.first_name}`}
                            title="Edit student" style={{ color: "var(--orange)" }}>
                      <IconEdit />
                    </Button>
                    <Button variant="danger-icon" onClick={() => askDelete(s)}
                            aria-label={`Remove ${s.last_name}, ${s.first_name}`}
                            title="Remove from the school roster">
                      <IconTrash />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          {shown.length} student{shown.length === 1 ? "" : "s"}
          {section ? ` in ${section}` : ""}, ascending by student number.
        </p>
      )}

      {deleting && (
        <ConfirmDialog
          title="Remove from the school roster"
          message={
            `Remove ${deleting.student.last_name}, ${deleting.student.first_name} ` +
            `(${deleting.student.student_number}) from the school roster? ` +
            `They will disappear from every teacher's class lists.` +
            (deleting.papers > 0
              ? ` ${deleting.papers} test paper(s) across all teachers are linked ` +
                `to them. Those papers keep their scores and marked answers — they ` +
                `will simply no longer be linked to a roster entry.`
              : "")
          }
          confirmLabel={deleteBusy ? "Removing…" : "Yes"}
          cancelLabel="No"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          dangerous
        />
      )}
    </>
  );
}
