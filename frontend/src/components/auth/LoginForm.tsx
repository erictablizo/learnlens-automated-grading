"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
// NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3, which names "Login".
import { advanceOnEnter, makeFieldCheck } from "@/lib/formNav";

/* NEW 2026-11-24 — requirement 3, FIFTH revision:
 *
 *   "Apply validation if you click enter in the first box and it's blank,
 *    and contains special characters, that when the validaition appears,
 *    once first box has been entered with info then it will proceed to
 *    second box, apply it as well in the succeeding input box"
 *
 * LIFTED OUT OF handleSubmit, not copied beside it. Both the Enter key and
 * the Sign in button now call these, so the two cannot drift into disagreeing
 * about what a valid email is — which is the failure the Create Exam bench
 * has a mutation for.
 *
 * The same two rules live in RegisterForm and ForgotPasswordForm. That
 * duplication predates this change and is not made worse by it; a shared
 * lib/authFields.ts would be the tidy answer and is not a thing to do nine
 * days before a defence. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkEmailField(v: string): string | null {
  if (!v.trim()) return "Please enter your email address.";
  if (!EMAIL_RE.test(v)) return "Please enter a valid email address.";
  return null;
}

function LoginFormInner() {
  const { login, isLoading, error, setError } = useAuth();
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [justRegistered, setJustRegistered] = useState(false);

  /* NEW 2026-11-24 — requirement 3, fifth revision. Keyed by aria-label:
   * these boxes have no ids, and makeFieldCheck falls back to it. */
  const fieldCheck = useMemo(() => makeFieldCheck({
    "Email address": { check: checkEmailField, show: setError },
    "Password": {
      check: v => (v ? null : "Please enter your password."), show: setError },
  }), [setError]);

  // Show success banner when redirected back from Register
  useEffect(() => {
    if (searchParams.get("registered") === "1") {
      setJustRegistered(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // CHANGED 2026-10-22: was "Please enter your email." Forgot Password says
    // "...your email address." for the same condition, two screens away.
    const emailMsg = checkEmailField(email);
    if (emailMsg) { setError(emailMsg); return; }
    if (!password) { setError("Please enter your password."); return; }
    await login(email, password);
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <h1 className="auth-title">Login to your<br />account</h1>

        {/* Registration success banner (HCI: feedback / give away spoilers) */}
        {justRegistered && (
          <div
            role="status"
            aria-live="polite"
            className="alert alert-success"
            style={{ marginBottom: "1rem" }}
          >
            Account created! Please sign in to continue.
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div role="alert" aria-live="assertive" className="alert alert-error">
            {error}
          </div>
        )}

        {/* NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3: Enter moves to
            the next box, and on the last box it signs in.

            THE ROOT IS `e.currentTarget`, the <form> itself — no ref. This is
            the one place lib/formNav.ts composes with a real form instead of
            standing in for one: advanceOnEnter returns FALSE on the last box
            and does not preventDefault, so the browser's own submit runs and
            Enter in the password box signs in exactly as it always has. The
            note at the top of formNav.ts explains why these screens were not
            turned INTO forms; Login already was one, and that is a gift. */}
        <form onSubmit={handleSubmit} noValidate
              onKeyDown={e => { advanceOnEnter(e, e.currentTarget, undefined, fieldCheck); }}>
          <div className="field">
            <input
              type="email"
              placeholder="Email"
              /* NEW 2026-11-24 — requirement 3: the cursor starts here. */
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              aria-label="Email address"
              disabled={isLoading}
            />
          </div>

          <div className="field">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-label="Password"
              disabled={isLoading}
            />
          </div>

          <div className="forgot-row">
            <Link href="/login/forgot_password" className="link-orange" style={{ fontSize: "0.82rem" }}>
              Forgot password
            </Link>
          </div>

          <button type="submit" className="btn-primary" disabled={isLoading} aria-busy={isLoading}>
            {isLoading
              ? <><span className="spinner" aria-hidden="true" /> Signing in…</>
              : "Sign in"}
          </button>
        </form>

        {/* REMOVED 2026-11-24 — Ms. Melanie, Recommendations page 19,
            requirement 2: "Remove this option in Landing Page", with a red box
            round "Don't have an account? Create an account".

            IT FOLLOWS FROM HER REQUIREMENT 1. Page 19 gives account creation
            to the admin — "Admin can create accounts, edit and delete" — so a
            teacher signing herself up is the thing being removed, not the
            link's wording.

            THE LINK IS GONE; THE ROUTE IS NOT. /register still answers to
            anyone who types it, so this hides a door rather than locking it.
            Her requirement 4 sends the admin's "Create New Account" to that
            same page, so the guard has to be "signed in AND admin", not a
            deletion. That needs the register route and hooks/useAuth, neither
            of which is in this tree — flagged to Grace 2026-11-24, not
            silently left. */}
      </div>
    </div>
  );
}

// Suspense boundary required by Next.js for useSearchParams
export default function LoginForm() {
  return (
    <Suspense fallback={<div className="auth-bg" />}>
      <LoginFormInner />
    </Suspense>
  );
}