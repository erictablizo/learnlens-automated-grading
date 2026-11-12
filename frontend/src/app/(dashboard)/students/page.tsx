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
 * This is the prerequisite for item 7, "Batch upload of Exam": once a student
 * number names the image file, the upload knows whose paper is whose.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PasteStudentsModal from "@/components/students/PasteStudentsModal";
import { studentService } from "@/services/studentService";
import type { Student, StudentBulkResult } from "@/types/student";
import { getToken, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";

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

const BLANK = { student_number: "", last_name: "", first_name: "", section: "" };

export default function StudentsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [section, setSection] = useState("");
  const [query, setQuery] = useState("");

  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    load();
  }, [load, router]);

  const resetForm = () => { setForm({ ...BLANK }); setEditingId(null); setFormError(null); };

  const handleSave = async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setSaving(true); setFormError(null);
    const body = {
      student_number: form.student_number,
      last_name: form.last_name,
      first_name: form.first_name,
      section: form.section || null,
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
      // `detail` onto it. Nothing to compose.
      setFormError(e instanceof Error ? e.message : "Could not save that student.");
    } finally { setSaving(false); }
  };

  const startEdit = (s: Student) => {
    setEditingId(s.student_id);
    setForm({
      student_number: s.student_number, last_name: s.last_name,
      first_name: s.first_name, section: s.section ?? "",
    });
    setFormError(null);
  };

  /**
   * Ask the server how many papers are linked BEFORE showing the confirm, so
   * the dialog can say so. Removing a student does not delete their papers -
   * the FK is ON DELETE SET NULL - but it does unlink them, and a teacher
   * should be told that three graded papers are about to lose their link.
   */
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

  /**
   * The bulk response is a REPORT, not a success or a failure. All three lists
   * matter: 32 added, 2 already there and 1 unreadable is a normal outcome of
   * re-pasting a list, and collapsing it to "error" would hide the 32.
   */
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

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: "0.25rem" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem",
                       fontWeight: 700, color: "var(--navy)" }}>
            Students
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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap",
                      alignItems: "flex-end", marginBottom: "1.5rem" }}>
          {([
            ["student_number", "Student No.", "2021-00123", 150],
            ["last_name", "Last Name", "Cruz", 180],
            ["first_name", "First Name", "Ana", 180],
            ["section", "Section", "BSCS 3A", 150],
          ] as const).map(([field, label, placeholder, width]) => (
            <div key={field} style={{ flex: `0 1 ${width}px` }}>
              <label className="form-label" htmlFor={`f-${field}`}>{label}</label>
              <input
                id={`f-${field}`}
                className="form-input"
                value={form[field]}
                list={field === "section" ? "roster-sections" : undefined}
                onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleSave(); } }}
                placeholder={placeholder}
              />
            </div>
          ))}
          <datalist id="roster-sections">
            {sections.map(s => <option key={s} value={s} />)}
          </datalist>
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

        {/* ── Filters ── */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <select className="form-input" value={section} style={{ flex: "0 1 180px" }}
                  onChange={e => setSection(e.target.value)} aria-label="Filter by section">
            <option value="">All sections</option>
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
                <th style={{ width: 140 }}>Section</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem",
                                             color: "var(--text-muted)" }}>Loading…</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem",
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

        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </main>
    </div>
  );
}