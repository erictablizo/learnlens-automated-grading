"use client";
/**
 * components/auth/ChangePasswordModal.tsx
 * =======================================
 * NEW 2026-11-26 — Ms. Melanie, Recommendations page 20.
 *
 *   requirement 2  "If Click 'Change Password' it will pop-up a Window"
 *                  Email / Old Password / New Password / Confirm Password,
 *                  Proceed and Cancel, and "the same validation criteria for
 *                  New Password (similar with Password Setting)".
 *   requirement 3  after Proceed: "Password has been successfully changed."
 *                  then a button with "Back to login".
 *
 * ON THE LOGIN SCREEN, WITH NO SESSION. That is why this is a dialog and not
 * a page under /profile: the teacher it is for was handed a temporary
 * password by the administrator minutes ago and has nothing to sign in with
 * yet. The old password is what authenticates the request.
 *
 * "BACK TO LOGIN" CLOSES THE DIALOG, it does not navigate. The login form is
 * already behind it; routing to /login from /login would reload the page to
 * arrive at the screen the person is looking at.
 *
 * THE SAME RULE, NOT THE SAME WORDS. checkPassword from lib/password is what
 * the Register and Reset screens use and it mirrors schemas/user.py; the
 * server checks again regardless. Writing the four rules out here would be a
 * fourth copy, and the 2026-10-22 note records what the third one cost.
 */
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { checkPassword } from "@/lib/password";
import { changePasswordService } from "@/services/changePasswordService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const field: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.1rem", fontSize: "0.9rem",
  border: "none", borderBottom: "1px solid var(--border)",
  background: "transparent", outline: "none",
};
const label: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", color: "var(--text-muted)",
  letterSpacing: "0.02em", marginBottom: "0.1rem",
};

export default function ChangePasswordModal(
  { open, onClose }: { open: boolean; onClose: () => void },
) {
  const [email,   setEmail]   = useState("");
  const [oldPw,   setOldPw]   = useState("");
  const [newPw,   setNewPw]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [done,    setDone]    = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);

  /* Cleared when the dialog OPENS, not when it closes. A password left in
     React state after Cancel is still in memory, and reopening would show
     the previous attempt's error over empty boxes. */
  useEffect(() => {
    if (!open) return;
    setEmail(""); setOldPw(""); setNewPw(""); setConfirm("");
    setError(null); setDone(null); setBusy(false);
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const proceed = async () => {
    setError(null);

    /* CHECKED HERE SO THE ANSWER IS INSTANT, and checked again on the server
       because this copy can be skipped by anything that is not this form. */
    if (!email.trim())         return setError("Please enter your email address.");
    if (!EMAIL_RE.test(email)) return setError("Please enter a valid email address.");
    if (!oldPw)                return setError("Please enter your old password.");
    const pwError = checkPassword(newPw);
    if (pwError)               return setError(pwError);
    if (newPw !== confirm)     return setError("The new passwords do not match.");
    if (newPw === oldPw) {
      return setError("Your new password must be different from your current one.");
    }

    setBusy(true);
    try {
      const r = await changePasswordService.change({
        email: email.trim(), old_password: oldPw, new_password: newPw,
      });
      /* The server writes the sentence and requirement 3 names it. Shown as
         it arrives rather than hard-coded here, so one place decides it. */
      setDone(r.message || "Password has been successfully changed.");
      setOldPw(""); setNewPw(""); setConfirm("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message
             : e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const ready = email.trim() && oldPw && newPw && confirm;

  return (
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(16, 24, 40, 0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem", overflowY: "auto",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        tabIndex={-1}
        style={{
          background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420,
          padding: "1.6rem 1.5rem 1.4rem", outline: "none",
          boxShadow: "0 10px 40px rgba(16,24,40,0.18)",
        }}
      >
        <h2 id="change-password-title" className="auth-title"
            style={{ fontSize: "1.4rem", marginBottom: "0.9rem" }}>
          Change a password
        </h2>

        {done ? (
          /* ── Requirement 3 ──────────────────────────────────────────── */
          <>
            <div role="status" aria-live="polite" className="alert alert-success"
                 style={{ marginBottom: "1.1rem" }}>
              {done}
            </div>
            <button type="button" className="btn-primary" onClick={onClose}>
              Back to login
            </button>
          </>
        ) : (
          <>
            {error && (
              <div role="alert" aria-live="assertive" className="alert alert-error"
                   style={{ marginBottom: "0.9rem" }}>
                {error}
              </div>
            )}

            {/* A real <form>, so Enter submits and a password manager can see
                the three boxes for what they are. */}
            <form onSubmit={e => { e.preventDefault(); if (!busy) proceed(); }}>
              <div className="field" style={{ marginBottom: "0.9rem" }}>
                <label style={label} htmlFor="cp-email">Email</label>
                <input id="cp-email" type="email" style={field} value={email}
                       onChange={e => setEmail(e.target.value)}
                       autoComplete="username" autoFocus disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: "0.9rem" }}>
                <label style={label} htmlFor="cp-old">Old Password</label>
                <input id="cp-old" type="password" style={field} value={oldPw}
                       onChange={e => setOldPw(e.target.value)}
                       autoComplete="current-password" disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: "0.9rem" }}>
                <label style={label} htmlFor="cp-new">New Password</label>
                <input id="cp-new" type="password" style={field} value={newPw}
                       onChange={e => setNewPw(e.target.value)}
                       autoComplete="new-password" disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: "0.6rem" }}>
                <label style={label} htmlFor="cp-confirm">Confirm Password</label>
                <input id="cp-confirm" type="password" style={field} value={confirm}
                       onChange={e => setConfirm(e.target.value)}
                       autoComplete="new-password" disabled={busy} />
              </div>

              <p style={{ fontSize: "0.74rem", color: "var(--text-muted)",
                          lineHeight: 1.5, margin: "0 0 1rem" }}>
                {/* The rules the server will apply, said before it applies
                    them. Same wording and same order as schemas/user.py. */}
                At least 8 characters, with an UPPERCASE letter, a lowercase letter
                and a special character.
              </p>

              <button type="submit" className="btn-primary"
                      disabled={busy || !ready} aria-busy={busy}>
                {busy
                  ? <><span className="spinner" aria-hidden="true" /> Changing…</>
                  : "Proceed"}
              </button>
              <p className="auth-footer" style={{ marginTop: "0.8rem",
                                                  textAlign: "center" }}>
                <button type="button" onClick={onClose} disabled={busy}
                        style={{ background: "none", border: "none", padding: 0,
                                 font: "inherit", cursor: "pointer",
                                 color: "var(--text-muted)" }}>
                  Cancel
                </button>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}