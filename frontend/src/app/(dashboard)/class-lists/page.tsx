"use client";
/**
 * app/(dashboard)/class-lists/page.tsx
 * ====================================
 * NEW 2026-11-17 — Recommendations page 7, "List of Students".
 *
 *   "Additional Option in Side Bar after "Student" Options:
 *    Additional Option Label = "List of Students"
 *    This reflect students for each subject and specific schedule a Teacher
 *    handles."
 *   "Update LABEL from "List of Students under section <Section Name>"
 *    to "List of Students under <Subject Name> / <Schedule>""
 *   "Add also back button at the bottom (Back to Manage Exams)"
 *   "Once you input the Student number, it will auto-populate the Student
 *    Name Info ... from GLOBAL Database input of Student Table created
 *    ADMIN ID."
 *
 * /class-lists, not /list-of-students. "List of Students" is the LABEL a
 * teacher reads; the resource is a class list. A URL that reads like a
 * sentence from a document ages badly the moment the document is revised -
 * as page 6 was revised by page 7 two days after it was written.
 *
 * THE NAME BOXES ARE READ-ONLY, ALWAYS. This screen cannot create a student;
 * it can only put an existing one on a list. That is pages 6 and 7 together -
 * the administrator maintains the school record, the teacher assembles
 * classes from it - and making the boxes editable here would quietly give
 * every teacher a second way to write to the global table.
 *
 * Same shell as every other screen: dashboard-layout + <Navbar /> +
 * main-content, because (dashboard) has no layout.tsx and each page renders
 * its own sidebar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import ClassListPickerModal from "@/components/students/ClassListPickerModal";
import { classListService } from "@/services/classListService";
import { studentService } from "@/services/studentService";
import type { ClassList } from "@/types/classList";
import type { Student } from "@/types/student";
import { getToken, isAuthenticated } from "@/lib/auth";

const IconTrash = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

/** How long after the last keystroke the number is looked up. */
const LOOKUP_DELAY_MS = 400;

export default function ClassListsPage() {
  const router = useRouter();

  const [lists, setLists] = useState<ClassList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [active, setActive] = useState<ClassList | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [members, setMembers] = useState<Student[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [query, setQuery] = useState("");

  const [number, setNumber] = useState("");
  const [found, setFound] = useState<Student | null>(null);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The lookup is debounced, and a stale answer must not overwrite a newer
     one: the teacher types "2021-001" and then "2021-00123", and the first
     reply can land after the second. `seq` is the only guard that survives
     that - clearing a timer does not cancel a request already in flight. */
  const seq = useRef(0);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    let alive = true;
    classListService.list(token)
      .then(rows => { if (alive) setLists(rows); })
      .catch(() => { if (alive) setError("Could not load your lists."); })
      .finally(() => { if (alive) setListsLoading(false); });
    return () => { alive = false; };
  }, [router]);

  const loadMembers = useCallback(async (listId: number, q: string) => {
    const token = getToken();
    if (!token) return;
    setMembersLoading(true);
    try {
      const detail = await classListService.get(listId, token, q || undefined);
      setMembers(detail.students);
    } catch {
      setError("Could not load that list.");
    } finally { setMembersLoading(false); }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadMembers(active.class_list_id, query);
  }, [active, query, loadMembers]);

  /* Page 7's auto-fill. */
  useEffect(() => {
    const raw = number.trim();
    if (!raw) { setFound(null); setLookupMsg(null); return; }
    const mine = ++seq.current;
    setLookingUp(true);
    const t = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const s = await studentService.lookup(raw, token);
        if (mine !== seq.current) return;
        setFound(s); setLookupMsg(null);
      } catch (e: unknown) {
        if (mine !== seq.current) return;
        setFound(null);
        setLookupMsg(e instanceof Error ? e.message
          : "No student with that number has been added yet.");
      } finally {
        if (mine === seq.current) setLookingUp(false);
      }
    }, LOOKUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [number]);

  const handleCreate = async (subject: string, schedule: string) => {
    const token = getToken();
    if (!token) return;
    setCreating(true); setPickerError(null);
    try {
      const row = await classListService.create({ subject, schedule }, token);
      setLists(prev => [...prev, row]);
      setActive(row);
    } catch (e: unknown) {
      setPickerError(e instanceof Error ? e.message : "Could not create that list.");
    } finally { setCreating(false); }
  };

  const handleAdd = async () => {
    if (!active || !found) return;
    const token = getToken();
    if (!token) return;
    setAdding(true); setError(null);
    try {
      const r = await classListService.addStudent(
        active.class_list_id, number.trim(), token);
      setNotice(r.message);
      setNumber(""); setFound(null); setLookupMsg(null);
      await loadMembers(active.class_list_id, query);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add that student.");
    } finally { setAdding(false); }
  };

  const handleRemove = async (s: Student) => {
    if (!active) return;
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      const r = await classListService.removeStudent(
        active.class_list_id, s.student_id, token);
      setNotice(r.message);
      await loadMembers(active.class_list_id, query);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not remove that student.");
    }
  };

  const title = active
    ? `List of Students under ${active.subject} / ${active.schedule}`
    : "List of Students";

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem",
                     fontWeight: 700, color: "var(--navy)", marginBottom: "0.25rem" }}>
          {title}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          The student number is what links a test paper to a student — write it
          on the paper and name the photo after it.
        </p>

        {error && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        {notice && (
          <div className="alert alert-success" role="status" style={{ marginBottom: "1rem" }}>
            {notice}
          </div>
        )}

        {active && (
          <>
            <p className="section-title">Add a student</p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap",
                          alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div style={{ flex: "0 1 180px" }}>
                <label className="form-label" htmlFor="cl-number">
                  Student No.
                  <span aria-hidden="true" style={{ color: "var(--error)" }}> *</span>
                </label>
                <input
                  id="cl-number"
                  className="form-input"
                  value={number}
                  placeholder="2021-00123"
                  aria-required="true"
                  aria-invalid={!!lookupMsg}
                  style={lookupMsg ? { borderBottomColor: "var(--error)" } : undefined}
                  onChange={e => setNumber(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); void handleAdd(); }
                  }}
                />
              </div>

              {/* READ-ONLY, always. This screen cannot create a student. */}
              {([
                ["Last Name", found?.last_name],
                ["First Name", found?.first_name],
                ["Middle Name", found?.middle_name],
                ["Section", found?.section],
              ] as const).map(([label, value]) => (
                <div key={label} style={{ flex: "0 1 160px" }}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    value={value ?? ""}
                    readOnly
                    disabled
                    aria-label={`${label}, filled in from the school roster`}
                    placeholder={lookingUp ? "…" : "—"}
                  />
                </div>
              ))}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.6rem" }}>
                <Button variant="primary" onClick={handleAdd}
                        loading={adding} disabled={adding || !found}
                        style={{ width: "auto", padding: "0.55rem 1.2rem" }}>
                  Add
                </Button>
              </div>
            </div>

            {lookupMsg && (
              <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem",
                                       marginTop: "-1.1rem", marginBottom: "1.2rem" }}>
                {lookupMsg}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap",
                          marginBottom: "0.6rem" }}>
              <input className="form-input" value={query} style={{ flex: "1 1 220px" }}
                     onChange={e => setQuery(e.target.value)}
                     placeholder="Search name or number"
                     aria-label="Search this list" />
            </div>

            <div className="table-wrapper">
              <table aria-label="Students on this list">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Student No.</th>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th style={{ width: 130 }}>Middle Name</th>
                    <th style={{ width: 140 }}>Section</th>
                    <th style={{ width: 70 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {membersLoading ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem",
                                                 color: "var(--text-muted)" }}>Loading…</td></tr>
                  ) : members.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem",
                                                 color: "var(--text-muted)" }}>
                      {query ? "No students match that."
                             : "Nobody on this list yet. Add one by student number above."}
                    </td></tr>
                  ) : members.map(s => (
                    <tr key={s.student_id}>
                      <td style={{ fontWeight: 600, color: "var(--navy)" }}>{s.student_number}</td>
                      <td>{s.last_name}</td>
                      <td>{s.first_name}</td>
                      <td style={{ color: "var(--text-muted)" }}>{s.middle_name ?? "—"}</td>
                      <td style={{ color: "var(--text-muted)" }}>{s.section ?? "—"}</td>
                      <td>
                        <Button variant="danger-icon" onClick={() => handleRemove(s)}
                                aria-label={`Remove ${s.last_name}, ${s.first_name} from this list`}
                                title="Remove from this list only">
                          <IconTrash />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {members.length > 0 && (
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                {members.length} student{members.length === 1 ? "" : "s"} on this list.
                Removing one here leaves them on the school roster.
              </p>
            )}
          </>
        )}

        {/* "Add also back button at the bottom (Back to Manage Exams)" —
            page 7, and the same button Data Analytics already has. */}
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
          <Button variant="secondary" onClick={() => router.push("/exams")}>
            ← Back to Manage Exams
          </Button>
          {active && (
            <Button variant="secondary" onClick={() => { setActive(null); setNotice(null); }}
                    style={{ width: "auto" }}>
              Change subject / schedule
            </Button>
          )}
        </div>

        {active === null && (
          <ClassListPickerModal
            lists={lists}
            loading={listsLoading}
            busy={creating}
            error={pickerError}
            onCancel={() => router.push("/exams")}
            onPickExisting={l => { setActive(l); setPickerError(null); }}
            onCreate={handleCreate}
          />
        )}
      </main>
    </div>
  );
}
