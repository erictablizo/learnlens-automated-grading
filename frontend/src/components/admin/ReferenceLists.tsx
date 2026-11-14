"use client";
/**
 * components/admin/ReferenceLists.tsx
 * ===================================
 * NEW 2026-11-14 — maintaining the three dropdown lists.
 *
 *     Alex Passion / Julius Bancud, Recommendations page 1:
 *       "Create an Admin Page - only Admin ID can access this Page"
 *       "Where to maintain the list of College Info in College Dropdown List"
 *       "Where to maintain the list of Course / Program Info ..."
 *       "Where to maintain the list of Year Level Info ..."
 *
 * The three circled dropdowns on the Edit Profile screenshot. Until today
 * their contents were hardcoded in TWO places that had to be kept in step by
 * hand - `COLLEGE_OPTIONS` / `COURSES_BY_COLLEGE` in types/profile.ts and
 * `CollegeEnum` in backend/app/schemas/profile.py - and a third, the database
 * CHECK constraint that made a fifth college impossible to save at all.
 *
 * ITS OWN COMPONENT, not more lines in the Admin page. The page is a read-only
 * report of teachers and exams; this is the one part of the screen that
 * changes anything, and a reader should be able to see where that begins and
 * ends without scrolling through a 400-line file.
 *
 * SWITCH OFF, DO NOT DELETE. Every row shows how many profiles are standing on
 * it BEFORE any button is pressed, and Delete is offered only at zero. The
 * backend refuses the rest with a counted sentence; this screen just makes the
 * refusal unsurprising.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { adminReferenceService } from "@/services/referenceService";
import type { College, Course, YearLevel } from "@/types/reference";

const th: React.CSSProperties = {
  textAlign: "left", padding: "0.4rem 0.6rem", fontSize: "0.68rem",
  letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "0.4rem 0.6rem", fontSize: "0.82rem",
  borderBottom: "1px solid var(--border)", verticalAlign: "middle",
};
const mini: React.CSSProperties = {
  fontSize: "0.72rem", padding: "0.2rem 0.5rem", borderRadius: 6,
  border: "1px solid var(--border)", background: "transparent",
  cursor: "pointer", color: "var(--text-muted)",
};
const input: React.CSSProperties = {
  padding: "0.3rem 0.5rem", fontSize: "0.8rem",
  border: "1px solid var(--border)", borderRadius: 6,
};

/** "3 profiles" / "not in use" — said in words, because a bare 0 in a column
 *  does not tell a reader that 0 is what makes Delete safe. */
function Usage({ n }: { n: number | null }) {
  if (n === null) return null;
  return (
    <span style={{ fontSize: "0.72rem", color: n > 0 ? "var(--navy)" : "var(--text-muted)" }}>
      {n === 0 ? "not in use" : `${n} profile${n === 1 ? "" : "s"}`}
    </span>
  );
}

/** A row's Active switch. Always permitted — this is the safe operation. */
function ActiveToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      <span style={{ fontSize: "0.75rem", color: on ? "var(--navy)" : "var(--text-muted)" }}>
        {on ? "Active" : "Hidden"}
      </span>
    </label>
  );
}

export default function ReferenceLists() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [courses,  setCourses]  = useState<Course[]>([]);
  const [levels,   setLevels]   = useState<YearLevel[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<{ kind: "college" | "course"; id: number } | null>(null);
  const [editText, setEditText] = useState("");

  const token = () => getToken() ?? "";

  const loadColleges = useCallback(async () => {
    try { setColleges(await adminReferenceService.colleges(token())); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the lists."); }
  }, []);

  const loadChildren = useCallback(async (collegeId: number) => {
    try {
      const [cs, ys] = await Promise.all([
        adminReferenceService.courses(collegeId, token()),
        adminReferenceService.yearLevels(collegeId, token()),
      ]);
      setCourses(cs); setLevels(ys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that college's lists.");
    }
  }, []);

  useEffect(() => { loadColleges(); }, [loadColleges]);
  useEffect(() => { if (selected !== null) loadChildren(selected); }, [selected, loadChildren]);

  /**
   * One wrapper around every write.
   *
   * A 409 here is NOT a bug — it is the backend refusing to move something a
   * teacher's profile is standing on, and its message already names the count.
   * So it is shown verbatim rather than replaced with wording of our own,
   * which is the only way the number in it stays true.
   */
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError(null);
    try { await fn(); after?.(); }
    catch (e) {
      setError(e instanceof ApiError ? e.message
             : e instanceof Error ? e.message : "That did not work.");
    } finally { setBusy(false); }
  };

  const refresh = () => { loadColleges(); if (selected !== null) loadChildren(selected); };
  const chosen = colleges.find(c => c.college_id === selected) ?? null;

  return (
    <section style={{ marginTop: "2.2rem" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)", fontSize: "1.05rem", margin: "0 0 0.3rem" }}>
        Dropdown Lists
      </h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 1rem", maxWidth: 680 }}>
        The College, Course / Program and Year Level choices offered on Edit Profile
        and Setup. Switching a row off hides it from those dropdowns while every
        profile already using it keeps working — so it is the safe way to retire a
        course. Delete is offered only where nothing is using the row.
      </p>

      {error && (
        <p role="alert" style={{
          fontSize: "0.82rem", lineHeight: 1.5, color: "#b42318",
          background: "#fef3f2", border: "1px solid #fda29b",
          borderRadius: 8, padding: "0.55rem 0.75rem", marginBottom: "1rem", maxWidth: 680,
        }}>
          {error}
        </p>
      )}

      {/* ── Colleges ── */}
      <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Code</th>
              <th style={th}>College</th>
              <th style={th}>In use</th>
              <th style={th}>Shown</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {colleges.map(c => (
              <tr key={c.college_id}
                  style={{ background: c.college_id === selected ? "var(--orange-light, #fff4e5)" : undefined }}>
                <td style={{ ...td, fontWeight: 600 }}>{c.code}</td>
                <td style={td}>
                  {editing?.kind === "college" && editing.id === c.college_id ? (
                    <span style={{ display: "flex", gap: "0.4rem" }}>
                      <input value={editText} onChange={e => setEditText(e.target.value)}
                             style={{ ...input, flex: 1 }} aria-label="College name" />
                      <button style={mini} disabled={busy} onClick={() => run(
                        () => adminReferenceService.editCollege(c.college_id, { name: editText }, token()),
                        () => { setEditing(null); refresh(); })}>Save</button>
                      <button style={mini} onClick={() => setEditing(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setSelected(c.college_id)}
                            style={{ background: "none", border: "none", padding: 0,
                                     cursor: "pointer", textAlign: "left", font: "inherit",
                                     color: "var(--navy)", textDecoration: "underline" }}>
                      {c.name}
                    </button>
                  )}
                </td>
                <td style={td}><Usage n={c.in_use} /></td>
                <td style={td}>
                  <ActiveToggle on={c.active} onChange={v => run(
                    () => adminReferenceService.editCollege(c.college_id, { active: v }, token()),
                    refresh)} />
                </td>
                <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                  <button style={mini} disabled={busy}
                          onClick={() => { setEditing({ kind: "college", id: c.college_id }); setEditText(c.name); }}>
                    Rename
                  </button>{" "}
                  {/* Offered ONLY at zero. The backend refuses the rest anyway;
                      hiding the button means the refusal is never a surprise. */}
                  {c.in_use === 0 && (
                    <button style={{ ...mini, color: "#b42318" }} disabled={busy}
                            onClick={() => run(
                              () => adminReferenceService.deleteCollege(c.college_id, token()),
                              () => { if (selected === c.college_id) setSelected(null); refresh(); })}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add a college. The code is what user_profiles.college stores, so the
          help text says so — it is not a display field. */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.8rem" }}>
        <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code, e.g. CCJE"
               aria-label="New college code" style={{ ...input, width: 140 }} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="College name"
               aria-label="New college name" style={{ ...input, flex: "1 1 280px", minWidth: 220 }} />
        <button className="btn" style={{ fontSize: "0.78rem" }}
                disabled={busy || !newCode.trim() || !newName.trim()}
                onClick={() => run(
                  () => adminReferenceService.addCollege(
                    { code: newCode.trim(), name: newName.trim(),
                      sort_order: colleges.length + 1 }, token()),
                  () => { setNewCode(""); setNewName(""); refresh(); })}>
          Add college
        </button>
      </div>

      {/* ── The chosen college's two lists ── */}
      {chosen ? (
        <div style={{ display: "flex", gap: "1.6rem", flexWrap: "wrap" }}>
          {/* Courses */}
          <div style={{ flex: "1 1 340px", minWidth: 300 }}>
            <h3 style={{ fontSize: "0.9rem", color: "var(--navy)", margin: "0 0 0.5rem" }}>
              Courses / Programs — {chosen.code}
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {courses.map(x => (
                  <tr key={x.course_id}>
                    <td style={td}>
                      {editing?.kind === "course" && editing.id === x.course_id ? (
                        <span style={{ display: "flex", gap: "0.4rem" }}>
                          <input value={editText} onChange={e => setEditText(e.target.value)}
                                 style={{ ...input, flex: 1 }} aria-label="Course name" />
                          <button style={mini} disabled={busy} onClick={() => run(
                            () => adminReferenceService.editCourse(x.course_id, { name: editText }, token()),
                            () => { setEditing(null); refresh(); })}>Save</button>
                          <button style={mini} onClick={() => setEditing(null)}>Cancel</button>
                        </span>
                      ) : (
                        <>
                          {x.name}{" "}
                          <span style={{ marginLeft: "0.3rem" }}><Usage n={x.in_use} /></span>
                        </>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                      <ActiveToggle on={x.active} onChange={v => run(
                        () => adminReferenceService.editCourse(x.course_id, { active: v }, token()),
                        refresh)} />{" "}
                      <button style={mini} disabled={busy}
                              onClick={() => { setEditing({ kind: "course", id: x.course_id }); setEditText(x.name); }}>
                        Rename
                      </button>{" "}
                      {x.in_use === 0 && (
                        <button style={{ ...mini, color: "#b42318" }} disabled={busy}
                                onClick={() => run(
                                  () => adminReferenceService.deleteCourse(x.course_id, token()), refresh)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {courses.length === 0 && (
                  <tr><td style={{ ...td, color: "var(--text-muted)" }}>No courses yet.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              <input value={newCourse} onChange={e => setNewCourse(e.target.value)}
                     placeholder="Course / Program name" aria-label="New course"
                     style={{ ...input, flex: 1 }} />
              <button className="btn" style={{ fontSize: "0.78rem" }}
                      disabled={busy || !newCourse.trim()}
                      onClick={() => run(
                        () => adminReferenceService.addCourse(
                          chosen.college_id,
                          { name: newCourse.trim(), sort_order: courses.length + 1 }, token()),
                        () => { setNewCourse(""); refresh(); })}>
                Add
              </button>
            </div>
          </div>

          {/* Year levels */}
          <div style={{ flex: "1 1 280px", minWidth: 260 }}>
            <h3 style={{ fontSize: "0.9rem", color: "var(--navy)", margin: "0 0 0.5rem" }}>
              Year Levels — {chosen.code}
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {levels.map(y => (
                  <tr key={y.year_level_id}>
                    <td style={td}>
                      {y.label}{" "}
                      <span style={{ marginLeft: "0.3rem" }}><Usage n={y.in_use} /></span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                      <ActiveToggle on={y.active} onChange={v => run(
                        () => adminReferenceService.editYearLevel(y.year_level_id, { active: v }, token()),
                        refresh)} />{" "}
                      {y.in_use === 0 && (
                        <button style={{ ...mini, color: "#b42318" }} disabled={busy}
                                onClick={() => run(
                                  () => adminReferenceService.deleteYearLevel(y.year_level_id, token()), refresh)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {levels.length === 0 && (
                  <tr><td style={{ ...td, color: "var(--text-muted)" }}>No year levels yet.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              {/* 1–6 is not a style choice: user_profiles.year_level carries a
                  CHECK for exactly that range, and an offerable level the
                  profile column cannot store would fail on the teacher's save. */}
              <input value={newLevel} onChange={e => setNewLevel(e.target.value)}
                     placeholder="1–6" aria-label="New year level number"
                     inputMode="numeric" style={{ ...input, width: 70 }} />
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                     placeholder="Label, e.g. 4th Year" aria-label="New year level label"
                     style={{ ...input, flex: 1 }} />
              <button className="btn" style={{ fontSize: "0.78rem" }}
                      disabled={busy || !newLevel.trim() || !newLabel.trim()}
                      onClick={() => run(
                        () => adminReferenceService.addYearLevel(
                          chosen.college_id,
                          { level: Number(newLevel), label: newLabel.trim() }, token()),
                        () => { setNewLevel(""); setNewLabel(""); refresh(); })}>
                Add
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Choose a college above to see its courses and year levels.
        </p>
      )}
    </section>
  );
}