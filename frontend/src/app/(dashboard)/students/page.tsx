"use client";
/**
 * app/(dashboard)/students/page.tsx
 * =================================
 * NEW 2026-11-12 — the student roster.
 *
 *   Doc Rubrica: "Create List of Students per Section"
 *   Alex Passion / Julius Bancud, page 2 item 4: "Test Paper -> ID # Student /
 *   ID Student # -> file of Test Exam / Primary Key -> Additional Table"
 *
 * CHANGED 2026-11-14 — a MIDDLE INITIAL box and column (Recommendations
 * page 1: "Student Middle Name").
 *
 * CHANGED 2026-11-15 (Grace, post-UAT) — "4 Textfields should have asterisk
 * meaning validations".
 *
 * THIS SCREEN HAD NO CLIENT-SIDE VALIDATION AT ALL. It posted whatever was
 * typed and printed whichever 422 came back, one field at a time, with no
 * marker on the box that caused it. So the asterisks arrive together with the
 * checking they are promising:
 *
 *   Student No.      checkStudentNumber - letters, digits, hyphen, no spaces,
 *                    50 characters, and REQUIRED
 *   Last / First     checkNamePart, the 2026-11-04 rule, unchanged
 *   Middle Name      checkMiddleName(v, true) - the same character rule as a
 *                    name part, now REQUIRED
 *   Section          CHANGED 2026-11-15 - REQUIRED, with the shared label
 *                    rule (letters, numbers, space and . , ( ) -). It was the
 *                    one box here with no rule at all: _section() collapsed
 *                    whitespace and capped the length, which is storage
 *                    hygiene, not validation, and "@@@" went straight in.
 *
 * Every one of those is the browser copy of the function in
 * backend/app/schemas/_text.py, so a value refused here is refused there with
 * the same sentence - measured, 56 checks, 0 disagreements.
 *
 * THE SERVER STILL VALIDATES. This is a courtesy, not a gate: formError below
 * still shows whatever the API says, because a 409 on a duplicate number is a
 * thing only the server can know.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PasteStudentsModal from "@/components/students/PasteStudentsModal";
// NEW 2026-11-16 - Recommendations page 5, "Select Option".
import SectionPickerModal from "@/components/students/SectionPickerModal";
// NEW 2026-11-17 - Recommendations page 6, the administrator's half.
import AdminStudentsPanel from "@/components/students/AdminStudentsPanel";
import { adminService } from "@/services/adminService";
import { studentService } from "@/services/studentService";
import type { Student, StudentBulkResult } from "@/types/student";
import { getToken, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";
// NEW 2026-11-15 — the same rules the API applies, in the browser.
import { checkStudentNumber, checkNamePart, checkMiddleName, checkSection }
  from "@/lib/textField";

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

function Toast({ msg, type, onDone }: { msg: string; type: "success" | "error"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 6000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        background: type === "success" ? "var(--success-bg)" : "var(--error-bg)",
        border: `1px solid ${type === "success" ? "#b2dfb2" : "#feb2b2"}`,
        color: type === "success" ? "var(--success)" : "var(--error)",
        borderRadius: "var(--radius-sm)", padding: "0.6rem 1.25rem",
        fontSize: "0.875rem", fontWeight: 500, zIndex: 9999,
        boxShadow: "var(--shadow)", maxWidth: "min(90vw, 640px)",
      }}
    >
      {type === "success" ? "✓" : "⚠"} {msg}
    </div>
  );
}

const BLANK = { student_number: "", last_name: "", first_name: "", middle_name: "", section: "" };
type FieldKey = keyof typeof BLANK;

/**
 * NEW 2026-11-15. The row of boxes, with its rule beside each one.
 *
 * The CHECK LIVES IN THE TABLE, not in a switch inside validate(). A field
 * that is added later cannot then be added without a rule, and the asterisk
 * is derived from `required` rather than typed into the JSX by hand - so a
 * box cannot be marked required and left unchecked, which is exactly what
 * this screen was before today.
 */
const FIELDS: ReadonlyArray<{
  key: FieldKey; label: string; placeholder: string; width: number;
  required: boolean; check: (v: string) => string | null;
}> = [
  { key: "student_number", label: "Student No.", placeholder: "2021-00123", width: 160,
    required: true,  check: v => checkStudentNumber(v) },
  { key: "last_name", label: "Last Name", placeholder: "Cruz", width: 170,
    required: true,  check: v => checkNamePart(v, "Last name") },
  { key: "first_name", label: "First Name", placeholder: "Ana", width: 170,
    required: true,  check: v => checkNamePart(v, "First name") },
  // CHANGED 2026-11-15: "Middle Name", not "Middle Initial". The field has
  // always stored a NAME - "Reyes" is accepted, and middleInitial() renders a
  // stored "R" as "R." only when composing student_name. The old label also
  // disagreed with the server's own message, which says "Middle name is
  // required."
  { key: "middle_name", label: "Middle Name", placeholder: "Reyes", width: 150,
    required: true,  check: v => checkMiddleName(v, true) },
  // CHANGED 2026-11-15: required, and checked. It keeps its datalist.
  { key: "section", label: "Section", placeholder: "BSCS 3A", width: 150,
    required: true,  check: v => checkSection(v, true) },
];

export default function StudentsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [section, setSection] = useState("");
  const [query, setQuery] = useState("");

  // NEW 2026-11-16 - Recommendations page 5.
  //
  // NULL means "has not chosen yet", which is what puts the modal on
  // screen. It is deliberately NOT the same thing as `section`: the
  // teacher can clear the filter back to every section afterwards without
  // the dialog reappearing, because `picked` stays set. The empty string
  // would have conflated the two.
  const [picked, setPicked] = useState<string | null>(null);

  // NEW 2026-11-17 - Recommendations page 6.
  //
  // NULL means "not known yet", which is NOT the same as false: rendering
  // the teacher roster while the answer is in flight would flash the wrong
  // screen at an administrator, and rendering the panel would flash the
  // wrong one at a teacher. The sidebar made the opposite choice on
  // 2026-11-13 - it assumes NOT an admin until told - because a link that
  // appears late is better than one that appears wrongly. Here a whole
  // screen is at stake, so it waits.
  //
  // adminService.isAdmin() never throws; a dead backend answers false.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { setIsAdmin(false); return; }
    let alive = true;
    adminService.isAdmin(token).then(v => { if (alive) setIsAdmin(v); });
    return () => { alive = false; };
  }, []);

  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // NEW 2026-11-15 — one message per box, cleared as that box is typed in.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const [showPaste, setShowPaste] = useState(false);
  const [deleting, setDeleting] = useState<{ student: Student; papers: number } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true); setLoadError(null);
    try {
      const [list, secs] = await Promise.all([
        studentService.list(token, { section: section || undefined, q: query || undefined }),
        studentService.sections(token),
      ]);
      setStudents(list);
      setSections(secs);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace("/login"); return; }
      setLoadError("Could not load the roster.");
    } finally { setLoading(false); }
  }, [router, section, query]);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    // CHANGED 2026-11-17: only a TEACHER loads this roster. Hooks run
    // before any return, so without this an administrator would fetch
    // GET /students and GET /students/sections on every mount and throw
    // both away - the panel reads /admin/students instead.
    if (isAdmin !== false) return;
    load();
  }, [load, router, isAdmin]);

  const resetForm = () => {
    setForm({ ...BLANK }); setEditingId(null);
    setFormError(null); setFieldErrors({});
  };

  /** NEW 2026-11-15. Every box, every time — not first-failure-wins, because a
   *  teacher correcting one field and pressing Add again only to be told about
   *  the next one is four round trips for one row. */
  const validate = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) {
      const msg = f.check(form[f.key]);
      if (msg) next[f.key] = msg;
    }
    setFieldErrors(next);
    const count = Object.keys(next).length;
    setFormError(count === 0 ? null
      : count === 1 ? "One field needs your attention."
      : `${count} fields need your attention.`);
    return count === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setSaving(true); setFormError(null);
    const body = {
      student_number: form.student_number,
      last_name: form.last_name,
      first_name: form.first_name,
      // CHANGED 2026-11-15. No `|| null` any more: validate() has just proved
      // this is a non-empty valid name, and sending null for a required field
      // would be a 422 the teacher cannot act on. Section keeps its `|| null`
      // because a blank section really is NULL.
      middle_name: form.middle_name,
      // CHANGED 2026-11-15: no `|| null` here either. Both are required and
      // validate() has just proved both are present.
      section: form.section,
    };
    try {
      if (editingId === null) {
        await studentService.create(body, token);
        setToast({ msg: `${body.last_name}, ${body.first_name} added.`, type: "success" });
      } else {
        await studentService.update(editingId, body, token);
        setToast({ msg: "Student updated.", type: "success" });
      }
      resetForm();
      await load();
    } catch (e: unknown) {
      // A 409 arrives here with the server's sentence already on .message -
      // "Student number X is already used by Cruz, Ana" - because api.ts maps
      // `detail` onto it. Nothing to compose, and nothing the browser could
      // have known before asking.
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
    setFormError(null);
    setFieldErrors({});
  };

  const askDelete = async (s: Student) => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const detail = await studentService.get(s.student_id, token);
      setDeleting({ student: s, papers: detail.papers_count });
    } catch {
      setDeleting({ student: s, papers: 0 });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setDeleteBusy(true);
    try {
      const result = await studentService.remove(deleting.student.student_id, token);
      setDeleting(null);
      setToast({ msg: result.message, type: result.papers_unlinked > 0 ? "error" : "success" });
      if (editingId === deleting.student.student_id) resetForm();
      await load();
    } catch (e: unknown) {
      setDeleting(null);
      setToast({ msg: e instanceof Error ? e.message : "Could not remove that student.", type: "error" });
    } finally { setDeleteBusy(false); }
  };

  const handleBulkAdded = async (r: StudentBulkResult) => {
    setShowPaste(false);
    const detail = [...r.skipped, ...r.failed]
      .slice(0, 3)
      .map(i => `line ${i.line}: ${i.reason}`)
      .join(" · ");
    const more = r.skipped.length + r.failed.length - 3;
    setToast({
      msg: r.message + (detail ? ` — ${detail}` : "") + (more > 0 ? ` (+${more} more)` : ""),
      type: r.failed.length > 0 ? "error" : "success",
    });
    await load();
  };

  // NEW 2026-11-17 - Recommendations page 6: "For ADMIN Page ONLY ...
  // Remove this Pop-up Page ... Instead display this Page ONLY".
  //
  // AFTER every hook, never inside a condition: React requires the same
  // hooks in the same order on every render, and an early return above
  // them would change that between the two branches.
  if (isAdmin === null) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content"
              style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="spinner spinner-dark" />
          <span style={{ color: "var(--text-muted)" }}>Loading…</span>
        </main>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content">
          <AdminStudentsPanel />
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: "0.25rem" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem",
                       fontWeight: 700, color: "var(--navy)" }}>
            {/* CHANGED 2026-11-16 - Recommendations page 5. It follows the
                FILTER, not the modal's answer, so clearing the filter puts
                the plain title back rather than leaving a heading that
                names one section above a list showing all of them. */}
            {section
              ? `List of Students under section ${section}`
              : "Students"}
          </h1>
          <Button variant="secondary" onClick={() => setShowPaste(true)}
                  style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem",
                           borderColor: "var(--orange)", color: "var(--orange)" }}>
            Add a class list
          </Button>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          The student number is what links a test paper to a student — write it
          on the paper and name the photo after it.
        </p>

        {loadError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
            {loadError}
          </div>
        )}

        {/* ── Add / edit one ── */}
        <p className="section-title">{editingId === null ? "Add a student" : "Edit student"}</p>
        {formError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: "0.6rem" }}>
            {formError}
          </div>
        )}
        {/* alignItems: flex-start, not flex-end — a box that grows an error
            message underneath must not drag its neighbours down with it. */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap",
                      alignItems: "flex-start", marginBottom: "1.5rem" }}>
          {FIELDS.map(f => (
            <div key={f.key} style={{ flex: `0 1 ${f.width}px` }}>
              <label className="form-label" htmlFor={`f-${f.key}`}>
                {f.label}
                {f.required && (
                  <span aria-hidden="true" style={{ color: "var(--error)" }}> *</span>
                )}
              </label>
              <input
                id={`f-${f.key}`}
                className="form-input"
                value={form[f.key]}
                list={f.key === "section" ? "roster-sections" : undefined}
                aria-required={f.required || undefined}
                aria-invalid={!!fieldErrors[f.key]}
                style={fieldErrors[f.key] ? { borderBottomColor: "var(--error)" } : undefined}
                onChange={e => {
                  const v = e.target.value;
                  setForm(p => ({ ...p, [f.key]: v }));
                  // Clear THIS box's message only. Re-running every rule on
                  // every keystroke would light up boxes the teacher has not
                  // reached yet.
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
          <datalist id="roster-sections">
            {sections.map(s => <option key={s} value={s} />)}
          </datalist>
          {/* The buttons sit on the input line, not the label line. */}
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

        {/* ── Filters ── */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <select className="form-input" value={section} style={{ flex: "0 1 180px" }}
                  onChange={e => setSection(e.target.value)} aria-label="Filter by section">
            {/* CHANGED 2026-11-16 (Grace): "Select Section", not "All
                sections" - this list is now how a section is chosen, not
                merely how it is filtered away. */}
            <option value="">Select Section</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="form-input" value={query} style={{ flex: "1 1 220px" }}
                 onChange={e => setQuery(e.target.value)}
                 placeholder="Search name or number" aria-label="Search the roster" />
        </div>

        {/* ── The roster ── */}
        <div className="table-wrapper">
          <table aria-label="Students">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Student No.</th>
                <th>Last Name</th>
                <th>First Name</th>
                <th style={{ width: 110 }}>Middle Name</th>
                <th style={{ width: 140 }}>Section</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem",
                                             color: "var(--text-muted)" }}>Loading…</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem",
                                             color: "var(--text-muted)" }}>
                  {section || query
                    ? "No students match that."
                    : "No students yet. Add one above, or paste a class list."}
                </td></tr>
              ) : students.map(s => (
                <tr key={s.student_id}
                    style={{ background: editingId === s.student_id ? "var(--orange-light)" : undefined }}>
                  <td style={{ fontWeight: 600, color: "var(--navy)" }}>{s.student_number}</td>
                  <td>{s.last_name}</td>
                  <td>{s.first_name}</td>
                  {/* An em dash for a row written before 2026-11-14, which has
                      NULL in the column. Those rows are still READ - the
                      requirement is on writing - so this stays. Editing one
                      now demands a middle initial before it can be saved. */}
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
                              title="Remove from roster">
                        <IconTrash />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {students.length > 0 && (
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            {students.length} student{students.length === 1 ? "" : "s"}
            {section ? ` in ${section}` : ""}.
          </p>
        )}

        {deleting && (
          <ConfirmDialog
            title="Remove from roster"
            message={
              `Remove ${deleting.student.last_name}, ${deleting.student.first_name} ` +
              `(${deleting.student.student_number}) from the roster?` +
              (deleting.papers > 0
                ? ` ${deleting.papers} test paper(s) are linked to them. Those papers ` +
                  `keep their scores and marked answers — they will simply no longer ` +
                  `be linked to a roster entry.`
                : "")
            }
            confirmLabel={deleteBusy ? "Removing…" : "Yes"}
            cancelLabel="No"
            onConfirm={confirmDelete}
            onCancel={() => setDeleting(null)}
            dangerous
          />
        )}

        {showPaste && (
          <PasteStudentsModal
            defaultSection={section}
            knownSections={sections}
            onClose={() => setShowPaste(false)}
            onAdded={handleBulkAdded}
          />
        )}

        {/* NEW 2026-11-16 - Recommendations page 5. Mounted with the page
            rather than hung off the sidebar click, so a reload or a typed
            URL asks the same question. Cancel leaves for Manage Exams,
            which is where the sidebar click came from. */}
        {picked === null && isAdmin === false && (
          <SectionPickerModal
            sections={sections}
            loading={loading}
            onCancel={() => router.push("/exams")}
            onProceed={s => {
              setPicked(s);
              setSection(s);
              // Pre-fill the Add-a-student Section box too. For a NEW
              // section this is the only place the name survives until a
              // student is saved into it; for an existing one it saves the
              // teacher retyping what she just chose.
              setForm(p => ({ ...p, section: s }));
              setFieldErrors(p => (p.section ? { ...p, section: undefined } : p));
            }}
          />
        )}

        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </main>
    </div>
  );
}