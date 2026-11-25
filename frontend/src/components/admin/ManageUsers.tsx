"use client";
/**
 * components/admin/ManageUsers.tsx
 * ================================
 * NEW 2026-11-25 — Ms. Melanie, Recommendations page 19.
 *
 *   requirement 1   "Admin can create accounts, edit and delete"
 *   requirement 3b  a Manage Users control on the Administrator screen
 *   requirement 4   it opens a pop-window, with "Create New Account"
 *   requirement 5   the List of Users table, with Status Active / Resigned
 *                   and "Note: Default Status value is <Active>"
 *
 * A <button> OWNING A DIALOG, not a <Link> to a page, because that is what
 * her page 19 draws: the list appears over the Administrator screen the
 * admin is already reading, and closing it puts them back where they were.
 *
 * ITS OWN COMPONENT, the same reason ReferenceLists is: the Administrator
 * page is a read-only report, and a reader should be able to see where the
 * part that CHANGES THINGS begins and ends without scrolling a 400-line file.
 *
 * CREATE DOES NOT GO TO /register, and this is the whole reason
 * POST /api/admin/users exists. /register calls useAuth.register(), which
 * ends in setAuth() with the new account's token — the administrator would
 * be signed out and become the teacher they had just created. The form below
 * posts to the admin endpoint, which issues no token, so the admin stays
 * signed in. See the note on adminUserService.create.
 *
 * DELETE IS DISABLED, NOT HIDDEN, when the account owns exams.
 * ReferenceLists hides its Delete at in_use > 0 and its 2026-11-17 note
 * records why that cost it a column alignment. Here the reason to keep it
 * visible is different and stronger: her requirement 5 puts Edit and Delete
 * beside every row, so a row with no Delete reads as a missing feature at
 * the defence. Disabled with the count in the tooltip says the true thing
 * instead — the button exists, and this account is not one it applies to.
 * The backend refuses it anyway; this only means the refusal is never a
 * surprise.
 *
 * EVERY 409 IS SHOWN VERBATIM. The backend writes those sentences for this
 * screen and they carry counts and names — "owns 3 exam(s)", "the last
 * active administrator". lib/api.ts has already unwrapped FastAPI's detail
 * into ApiError.message, so replacing the wording here is the one way to
 * make the number inside it wrong.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { adminUserService } from "@/services/adminUserService";
import {
  USER_ACTIVE, USER_RESIGNED,
  type AdminUserRow, type AdminUserUpdate,
} from "@/types/adminUser";

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

/** Title Case on screen, lowercase in the column — same as `role`. */
function StatusCell({ row, busy, onChange }: {
  row: AdminUserRow; busy: boolean; onChange: (v: string) => void;
}) {
  const resigned = row.status === USER_RESIGNED;
  return (
    <select
      value={row.status}
      disabled={busy}
      onChange={e => onChange(e.target.value)}
      aria-label={`Status for ${row.email}`}
      style={{
        ...input,
        fontSize: "0.75rem",
        color:      resigned ? "var(--text-muted)" : "var(--navy)",
        background: resigned ? "var(--bg, #f4f4f5)" : "transparent",
      }}
    >
      <option value={USER_ACTIVE}>Active</option>
      <option value={USER_RESIGNED}>Resigned</option>
    </select>
  );
}

export default function ManageUsers() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [notice,  setNotice]  = useState<string | null>(null);

  const [creating,  setCreating]  = useState(false);
  const [cEmail,    setCEmail]    = useState("");
  const [cFirst,    setCFirst]    = useState("");
  const [cLast,     setCLast]     = useState("");
  const [cPassword, setCPassword] = useState("");

  const [editing,  setEditing]  = useState<number | null>(null);
  const [eEmail,   setEEmail]   = useState("");
  const [eFirst,   setEFirst]   = useState("");
  const [eLast,    setELast]    = useState("");
  const [confirm,  setConfirm]  = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const token = () => getToken() ?? "";

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await adminUserService.list(token())); }
    catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the accounts.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  /* Escape closes, and focus goes back to the button that opened it. Without
     the second half, closing the dialog drops focus onto <body> and a
     keyboard user restarts from the top of the page. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => { setOpen(false); openerRef.current?.focus(); };

  /**
   * One wrapper around every write, as ReferenceLists has.
   *
   * A 409 is NOT a bug here — it is the backend refusing, with a sentence
   * written for this screen. Shown verbatim.
   */
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); after?.(); }
    catch (e) {
      setError(e instanceof ApiError ? e.message
             : e instanceof Error ? e.message : "That did not work.");
    } finally { setBusy(false); }
  };

  const startEdit = (r: AdminUserRow) => {
    setEditing(r.user_id);
    setEEmail(r.email);
    /* "Surname, First" is what the server composes for display; it is not a
       field. Split it back for the two boxes, and leave them empty when the
       account has no profile row yet rather than inventing halves. */
    const [last = "", first = ""] = (r.name ?? "").split(",").map(s => s.trim());
    setELast(last); setEFirst(first);
  };

  const saveEdit = (r: AdminUserRow) => {
    /* Only what CHANGED. The route applies exclude_unset, so sending the
       whole row back would overwrite fields nobody touched — the 2026-11-03
       year_level lesson. */
    const body: AdminUserUpdate = {};
    const [last0 = "", first0 = ""] = (r.name ?? "").split(",").map(s => s.trim());
    if (eEmail.trim() && eEmail.trim() !== r.email) body.email = eEmail.trim();
    if (eLast.trim()  && eLast.trim()  !== last0)   body.last_name  = eLast.trim();
    if (eFirst.trim() && eFirst.trim() !== first0)  body.first_name = eFirst.trim();
    if (Object.keys(body).length === 0) { setEditing(null); return; }
    return run(() => adminUserService.update(r.user_id, body, token()),
               () => { setEditing(null); load(); });
  };

  const create = () =>
    run(() => adminUserService.create({
          email:      cEmail.trim(),
          password:   cPassword,
          first_name: cFirst.trim(),
          last_name:  cLast.trim(),
        }, token()),
        () => {
          setNotice(`${cEmail.trim()} was created, with Status Active. They will `
                  + `be asked to choose their college and course when they first `
                  + `sign in.`);
          setCEmail(""); setCFirst(""); setCLast(""); setCPassword("");
          setCreating(false);
          load();
        });

  const canCreate = cEmail.trim() && cFirst.trim() && cLast.trim() && cPassword;

  return (
    <section style={{ marginTop: "2.2rem" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)",
                   fontSize: "1.05rem", margin: "0 0 0.3rem" }}>
        Users
      </h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6,
                  margin: "0 0 0.8rem", maxWidth: 680 }}>
        Create a teacher account, correct a name or an email, and set an account to
        Resigned when someone leaves. A resigned account can no longer sign in, and
        everything they recorded stays exactly where it is.
      </p>

      <button ref={openerRef} className="btn" style={{ fontSize: "0.82rem" }}
              onClick={() => setOpen(true)}>
        Manage Users
      </button>

      {!open ? null : (
        <div
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget) close(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(16, 24, 40, 0.45)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "3vh 1rem", overflowY: "auto",
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-users-title"
            tabIndex={-1}
            style={{
              background: "var(--card, #fff)", borderRadius: 14,
              border: "1px solid var(--border)", width: "100%", maxWidth: 940,
              padding: "1.2rem 1.3rem 1.4rem", outline: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline",
                          justifyContent: "space-between", gap: "1rem" }}>
              <h3 id="manage-users-title"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--navy)",
                           margin: 0, fontSize: "1.15rem" }}>
                List of Users
              </h3>
              <button style={mini} onClick={close} aria-label="Close">Close</button>
            </div>

            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)",
                        margin: "0.35rem 0 1rem" }}>
              {/* Her requirement 5, verbatim: "Note: Default Status value is
                  <Active>". Said on screen rather than only in the migration,
                  because the person choosing is reading this. */}
              A new account starts as <strong>Active</strong>.
            </p>

            {error && (
              <p role="alert" style={{
                fontSize: "0.82rem", lineHeight: 1.5, color: "#b42318",
                background: "#fef3f2", border: "1px solid #fda29b",
                borderRadius: 8, padding: "0.55rem 0.75rem", marginBottom: "0.9rem",
              }}>
                {error}
              </p>
            )}
            {notice && (
              <p role="status" style={{
                fontSize: "0.82rem", lineHeight: 1.5, color: "#05603a",
                background: "#ecfdf3", border: "1px solid #abefc6",
                borderRadius: 8, padding: "0.55rem 0.75rem", marginBottom: "0.9rem",
              }}>
                {notice}
              </p>
            )}

            {/* ── Create New Account (requirement 4) ── */}
            {!creating ? (
              <button className="btn" style={{ fontSize: "0.78rem", marginBottom: "1rem" }}
                      onClick={() => { setCreating(true); setError(null); setNotice(null); }}>
                Create New Account
              </button>
            ) : (
              <div style={{
                border: "1px solid var(--border)", borderRadius: 10,
                padding: "0.8rem", marginBottom: "1.1rem",
                background: "var(--bg, #fafafa)",
              }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input value={cLast} onChange={e => setCLast(e.target.value)}
                         placeholder="Surname" aria-label="Surname"
                         style={{ ...input, flex: "1 1 150px" }} />
                  <input value={cFirst} onChange={e => setCFirst(e.target.value)}
                         placeholder="First name" aria-label="First name"
                         style={{ ...input, flex: "1 1 150px" }} />
                  <input value={cEmail} onChange={e => setCEmail(e.target.value)}
                         placeholder="Email" aria-label="Email" type="email"
                         autoComplete="off"
                         style={{ ...input, flex: "1 1 220px" }} />
                  <input value={cPassword} onChange={e => setCPassword(e.target.value)}
                         placeholder="Temporary password" aria-label="Password"
                         type="password" autoComplete="new-password"
                         style={{ ...input, flex: "1 1 180px" }} />
                </div>
                <p style={{ fontSize: "0.74rem", color: "var(--text-muted)",
                            lineHeight: 1.5, margin: "0.55rem 0 0.7rem" }}>
                  {/* The server enforces these; saying them here means the
                      teacher is not told after the fact. Same rules, same
                      order and same words as schemas/user.py. */}
                  At least 8 characters, with an UPPERCASE letter, a lowercase letter
                  and a special character. The college and course are chosen by the
                  teacher when they first sign in.
                </p>
                <button className="btn" style={{ fontSize: "0.78rem" }}
                        disabled={busy || !canCreate} onClick={create}>
                  Create account
                </button>{" "}
                <button style={mini} onClick={() => { setCreating(false); setError(null); }}>
                  Cancel
                </button>
              </div>
            )}

            {/* ── The list (requirement 5) ── */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Email</th>
                    <th style={th}>Name</th>
                    <th style={th}>College</th>
                    <th style={th}>Course</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, textAlign: "right" }}>Exams</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isEditing = editing === r.user_id;
                    const owns      = r.exams > 0;
                    return (
                      <tr key={r.user_id}>
                        <td style={td}>
                          {isEditing ? (
                            <input value={eEmail} onChange={e => setEEmail(e.target.value)}
                                   aria-label="Email" style={{ ...input, width: "100%" }} />
                          ) : (
                            <>
                              {r.email}
                              <span style={{ color: "var(--text-muted)",
                                             fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                                #{r.user_id}
                              </span>
                              {r.role === "admin" && (
                                <span style={{
                                  fontSize: "0.64rem", fontWeight: 700, marginLeft: "0.4rem",
                                  letterSpacing: "0.04em", textTransform: "uppercase",
                                  borderRadius: 20, padding: "1px 7px", color: "#7a3e00",
                                  background: "var(--orange-light, #fff4e5)",
                                }}>
                                  admin
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td style={td}>
                          {isEditing ? (
                            <span style={{ display: "flex", gap: "0.35rem" }}>
                              <input value={eLast} onChange={e => setELast(e.target.value)}
                                     placeholder="Surname" aria-label="Surname"
                                     style={{ ...input, width: "50%" }} />
                              <input value={eFirst} onChange={e => setEFirst(e.target.value)}
                                     placeholder="First name" aria-label="First name"
                                     style={{ ...input, width: "50%" }} />
                            </span>
                          ) : (
                            r.name ?? <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={td}>
                          {r.college ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={td}>
                          {r.course ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={td}>
                          <StatusCell row={r} busy={busy} onChange={v => run(
                            () => adminUserService.update(r.user_id, { status: v }, token()),
                            load)} />
                        </td>
                        <td style={{ ...td, textAlign: "right",
                                     fontVariantNumeric: "tabular-nums" }}>
                          {r.exams}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                          {isEditing ? (
                            <>
                              <button style={mini} disabled={busy}
                                      onClick={() => saveEdit(r)}>Save</button>{" "}
                              <button style={mini}
                                      onClick={() => setEditing(null)}>Cancel</button>
                            </>
                          ) : confirm === r.user_id ? (
                            <>
                              <span style={{ fontSize: "0.72rem", marginRight: "0.4rem" }}>
                                Delete {r.email}?
                              </span>
                              <button style={{ ...mini, color: "#b42318" }} disabled={busy}
                                      onClick={() => run(
                                        () => adminUserService.remove(r.user_id, token()),
                                        () => { setConfirm(null); load(); })}>
                                Yes, delete
                              </button>{" "}
                              <button style={mini}
                                      onClick={() => setConfirm(null)}>No</button>
                            </>
                          ) : (
                            <>
                              <button style={mini} disabled={busy}
                                      onClick={() => startEdit(r)}>Edit</button>{" "}
                              <button
                                style={{ ...mini, color: owns ? "var(--text-muted)" : "#b42318",
                                         cursor: owns ? "not-allowed" : "pointer" }}
                                disabled={busy || owns}
                                title={owns
                                  ? `${r.email} owns ${r.exams} exam(s). Deleting the `
                                    + `account would delete those exams and every answer `
                                    + `key, test paper and score on them. Set Status to `
                                    + `Resigned instead — the account can no longer be `
                                    + `used and all of its work is kept.`
                                  : `Delete ${r.email}`}
                                onClick={() => { setConfirm(r.user_id); setError(null); }}>
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && rows.length === 0 && (
                    <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={7}>
                      No accounts.
                    </td></tr>
                  )}
                  {loading && (
                    <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={7}>
                      Loading…
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}