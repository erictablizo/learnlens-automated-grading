"use client";
/**
 * app/(dashboard)/admin/page.tsx
 * ==============================
 * NEW 2026-11-13 — the administrator view.
 *
 *     Alex Passion / Julius Bancud, post-UAT page 2, item 1:
 *     "(*) Admin -> ID -> to handle maintenance"
 *
 * INSIDE `(dashboard)`, and that is not tidiness. Route groups do not appear
 * in URLs, so `npm run build` prints `/admin` whether this file sits in the
 * group or beside it, and the build output is NOT evidence the placement is
 * right. The 2026-11-11 Data Analytics note records this going wrong: the
 * page landed outside the group and rendered with no sidebar. Confirm with
 *
 *     ls "src/app/(dashboard)"
 *
 * — `admin` should sit beside `exams`, `reports`, `analytics` and `students`.
 *
 * CORRECTED 2026-11-13, after it was seen on learnlens.tech: THIS PAGE MUST
 * RENDER THE SIDEBAR ITSELF. The first version returned a bare <main> on the
 * assumption that `(dashboard)` supplies a layout. It does not - there is no
 * `(dashboard)/layout.tsx`, and every screen in the group wraps itself in
 *
 *     <div className="dashboard-layout"> <Navbar /> <main className="main-content">
 *
 * which the Edit Profile page states outright: "the sidebar is rendered per
 * page, not by a layout". Being inside the route group was necessary and not
 * sufficient, and `npm run build` cannot see the difference - the page
 * compiled, deployed and rendered, with no nav on it.
 *
 * READ-ONLY ABOUT TEACHERS' WORK, and the schema file says why: an
 * administrator who can delete across accounts has a blast radius nothing in
 * that note asks for, and the ownership guards installed on 2026-11-12 exist
 * precisely to keep one teacher out of another's papers. Widening that is a
 * separate decision taken on purpose, not a side effect of adding a list
 * screen. Nothing on the two tables below changes anything.
 *
 * CHANGED 2026-11-14 - that promise is now stated precisely rather than
 * loosely, because the page gained a third section that DOES write.
 * `ReferenceLists` maintains the College, Course / Program and Year Level
 * dropdowns, which is Recommendations page 1 and the reason the panel asked
 * for an admin page at all. Reference data belongs to the school, not to any
 * teacher; the one place the two meet - a row some profile is standing on -
 * cannot be deleted or re-coded, only switched off, and the backend counts
 * and refuses rather than trusting the screen.
 *
 * WHAT AN ADMINISTRATOR IS ACTUALLY LOOKING FOR, and why the columns are
 * these columns:
 *
 *   * a teacher who has created nothing      → Teachers, a row of zeros
 *   * an exam that will grade nothing        → Exams, `items` = 0 with papers
 *     uploaded. This is the state that looks finished and scores zero, and it
 *     is flagged rather than left for the reader to spot.
 *   * work outstanding                       → Exams, `papers` − `checked`
 *
 * The 403 case renders a SENTENCE, not an empty table. A teacher who reaches
 * this URL is told plainly that it is not for them; that is the same reason
 * `_admin` answers 403 and not 404.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
// NEW 2026-11-14 (Alex & Bancud, Recommendations page 1): the three dropdown
// lists. Its own component because it is the ONLY part of this screen that
// changes anything - see its header.
import ReferenceLists from "@/components/admin/ReferenceLists";
import { ApiError } from "@/lib/api";
import { getToken, isAuthenticated } from "@/lib/auth";
import { adminService } from "@/services/adminService";
import type { AdminExam, AdminOverview, AdminTeacher } from "@/types/admin";

/**
 * The dashboard shell every screen in this group renders for itself.
 *
 * One component rather than four copies, because this page returns from four
 * different branches (loading, denied, error, loaded) and the first version
 * shipped with the sidebar missing from ALL of them. A wrapper that cannot be
 * forgotten in one branch is the point.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">{children}</main>
    </div>
  );
}

/** The one-line totals, as five tiles. */
function Tile({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div
      style={{
        flex:         "1 1 120px",
        minWidth:     120,
        background:   "var(--card, #fff)",
        border:       "1px solid var(--border)",
        borderRadius: 12,
        padding:      "0.85rem 1rem",
      }}
    >
      <div style={{
        fontSize:   "1.6rem",
        fontWeight: 700,
        fontFamily: "var(--font-heading)",
        color:      muted ? "var(--text-muted)" : "var(--navy)",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize:      "0.72rem",
        color:         "var(--text-muted)",
        marginTop:     "0.2rem",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign:     "left",
  padding:       "0.5rem 0.6rem",
  fontSize:      "0.7rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color:         "var(--text-muted)",
  borderBottom:  "1px solid var(--border)",
  whiteSpace:    "nowrap",
};
const td: React.CSSProperties = {
  padding:      "0.5rem 0.6rem",
  fontSize:     "0.82rem",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
};
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [exams,    setExams]    = useState<AdminExam[]>([]);
  const [loading,  setLoading]  = useState(true);
  /** null = fine. A string = show this instead of the tables. */
  const [error,    setError]    = useState<string | null>(null);
  const [denied,   setDenied]   = useState(false);
  const [q,        setQ]        = useState("");

  // Same guard every other screen in this group uses. Without it an expired
  // session lands on "You are not signed in." instead of the login page, which
  // is a dead end rather than a route back.
  const router = useRouter();
  useEffect(() => { if (!isAuthenticated()) router.replace("/login"); }, [router]);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) { setError("You are not signed in."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    setDenied(false);
    // All three together: one render, no half-populated screen, and the three
    // numbers on the tiles always describe the same instant as the tables.
    Promise.all([
      adminService.overview(token),
      adminService.teachers(token),
      adminService.exams(token),
    ])
      .then(([o, t, e]) => { setOverview(o); setTeachers(t); setExams(e); })
      .catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setDenied(true);
          setError(e.message || "Administrator access is required.");
        } else if (e instanceof ApiError && e.status === 404) {
          // The router exists in the codebase but was never registered. This
          // is a deploy fault, not a permission one, and saying so saves an
          // hour of looking in the wrong place. See ROUTER-WIRING-2026-11-11.
          setError("The administrator endpoints are not registered on this server "
                 + "(404). Check that admin_router is included in "
                 + "backend/app/api/routes/__init__.py and rebuild the backend.");
        } else {
          setError(e instanceof Error ? e.message : "Could not load the administrator view.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // One search box over both tables. Matching is case-insensitive and spans
  // the fields an administrator would type: an email, an exam name, a
  // subject. `schedule` is included because "Monday 8AM" is a plausible
  // thing to look for and leaving it out would make the box feel broken.
  const needle = q.trim().toLowerCase();
  const shownTeachers = useMemo(
    () => (!needle ? teachers : teachers.filter(t =>
      t.email.toLowerCase().includes(needle) || t.role.toLowerCase().includes(needle))),
    [teachers, needle]);
  const shownExams = useMemo(
    () => (!needle ? exams : exams.filter(x =>
      x.exam_name.toLowerCase().includes(needle)
      || (x.subject ?? "").toLowerCase().includes(needle)
      || (x.schedule ?? "").toLowerCase().includes(needle)
      || x.owner_email.toLowerCase().includes(needle))),
    [exams, needle]);

  if (loading) {
    return <Shell><p style={{ color: "var(--text-muted)" }}>Loading…</p></Shell>;
  }

  if (denied) {
    return (
      <Shell>
        <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)", marginBottom: "0.6rem" }}>
          Administrator
        </h1>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
          {error}
        </p>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "0.8rem" }}>
          This screen lists every account and every exam in the installation, so it
          is limited to administrator accounts. Your own exams, papers and students
          are unaffected and are where they always were.
        </p>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div style={{ maxWidth: 680 }}>
          <h1 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)", marginBottom: "0.6rem" }}>
            Administrator
          </h1>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--danger, #b42318)" }}>{error}</p>
          <button className="btn" onClick={load} style={{ marginTop: "0.9rem" }}>Try again</button>
        </div>
      </Shell>
    );
  }

  // An exam with papers uploaded and NO answer-key rows grades every one of
  // them to zero while looking finished. It is the one row on this screen
  // that is a fault rather than a fact, so it is counted up front.
  const keyless = exams.filter(x => x.items === 0 && x.papers > 0).length;

  return (
    <Shell>
      <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)", margin: 0 }}>
          Administrator
        </h1>
        <button className="btn" onClick={load} style={{ fontSize: "0.78rem" }}>Refresh</button>
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0.4rem 0 1.1rem" }}>
        Every account and every exam in this installation. This screen is read-only —
        nothing here changes another teacher&apos;s data.
      </p>

      {/* ── Totals ── */}
      {overview && (
        <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", marginBottom: "1.4rem" }}>
          <Tile label="Teachers" value={overview.teachers} />
          <Tile label="Admins"   value={overview.admins} muted />
          <Tile label="Exams"    value={overview.exams} />
          <Tile label="Papers"   value={overview.papers} />
          <Tile label="Students" value={overview.students} />
        </div>
      )}

      {keyless > 0 && (
        <p style={{
          fontSize:     "0.82rem",
          lineHeight:   1.6,
          background:   "var(--orange-light, #fff4e5)",
          border:       "1px solid var(--orange, #e8a33d)",
          borderRadius: 10,
          padding:      "0.65rem 0.8rem",
          marginBottom: "1.2rem",
        }}>
          <strong>{keyless}</strong>{" "}
          {keyless === 1 ? "exam has" : "exams have"} test papers uploaded but no
          answer key generated. Those papers score zero against an empty key —
          marked ⚠ in the table below.
        </p>
      )}

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Filter by email, exam, subject or schedule…"
        aria-label="Filter"
        style={{
          width:        "100%",
          maxWidth:     380,
          padding:      "0.45rem 0.65rem",
          fontSize:     "0.85rem",
          border:       "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: "1.2rem",
        }}
      />

      {/* ── Accounts ── */}
      <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)", fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
        Accounts <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.85rem" }}>
          ({shownTeachers.length})
        </span>
      </h2>
      <div style={{ overflowX: "auto", marginBottom: "1.8rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={{ ...th, textAlign: "right" }}>Exams</th>
              <th style={{ ...th, textAlign: "right" }}>Students</th>
              <th style={{ ...th, textAlign: "right" }}>Papers</th>
            </tr>
          </thead>
          <tbody>
            {shownTeachers.map(t => {
              const empty = t.exams === 0 && t.students === 0 && t.papers === 0;
              return (
                <tr key={t.user_id}>
                  <td style={td}>
                    {t.email}
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                      #{t.user_id}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize:      "0.68rem",
                      fontWeight:    700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      borderRadius:  20,
                      padding:       "1px 8px",
                      color:         t.role === "admin" ? "#7a3e00" : "var(--text-muted)",
                      background:    t.role === "admin" ? "var(--orange-light, #fff4e5)" : "var(--bg, #f4f4f5)",
                    }}>
                      {t.role}
                    </span>
                  </td>
                  <td style={tdNum}>{t.exams}</td>
                  <td style={tdNum}>{t.students}</td>
                  <td style={tdNum}>
                    {t.papers}
                    {/* A row of zeros is the thing this table exists to show. */}
                    {empty && (
                      <span title="This account has created nothing yet"
                            style={{ color: "var(--text-muted)", marginLeft: "0.4rem", fontSize: "0.72rem" }}>
                        empty
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {shownTeachers.length === 0 && (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={5}>No account matches that filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Exams ── */}
      <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)", fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
        Exams <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.85rem" }}>
          ({shownExams.length})
        </span>
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Exam</th>
              <th style={th}>Subject</th>
              <th style={th}>Schedule</th>
              <th style={th}>Owner</th>
              <th style={{ ...th, textAlign: "right" }} title="Answer-key rows. 0 = key not generated">Items</th>
              <th style={{ ...th, textAlign: "right" }}>Papers</th>
              <th style={{ ...th, textAlign: "right" }} title="Papers whose score is final">Checked</th>
            </tr>
          </thead>
          <tbody>
            {shownExams.map(x => {
              const noKey    = x.items === 0;
              const pending  = x.papers - x.checked;
              return (
                <tr key={x.exam_id}>
                  <td style={td}>
                    {x.exam_name}
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                      #{x.exam_id}
                    </span>
                  </td>
                  <td style={td}>{x.subject ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td style={td}>{x.schedule ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td style={td}>{x.owner_email}</td>
                  <td style={tdNum}>
                    {noKey ? (
                      <span
                        title={x.papers > 0
                          ? "No answer key has been generated. Every paper on this exam scores zero."
                          : "No answer key has been generated yet."}
                        style={{ color: x.papers > 0 ? "#b42318" : "var(--text-muted)", fontWeight: 600 }}
                      >
                        {x.papers > 0 ? "⚠ 0" : "0"}
                      </span>
                    ) : x.items}
                  </td>
                  <td style={tdNum}>{x.papers}</td>
                  <td style={tdNum}>
                    {x.checked}
                    {/* The difference is work outstanding, so it is spelled out
                        rather than left as arithmetic for the reader. */}
                    {pending > 0 && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                        {pending} left
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {shownExams.length === 0 && (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={7}>No exam matches that filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* NEW 2026-11-14. Below the two read-only tables, deliberately: an
          administrator arrives looking at the state of the installation, and
          maintenance is the thing they do second. */}
      <ReferenceLists />
      </div>
    </Shell>
  );
}