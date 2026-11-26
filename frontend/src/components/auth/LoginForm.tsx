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

        {/* CHANGED 2026-11-26 — Ms. Melanie: "Change Password instead of
            Create Account (Since Create Account is the admin's job)".

            WHAT WAS HERE, AND WHY IT WENT. "Don't have an account? Create an
            account", removed 2026-11-24 for her page 19 requirement 2. Her
            requirement 1 gives account creation to the admin, so a teacher
            signing herself up was the thing being removed, not the wording.
            The guard on /register landed 2026-11-25 and the admin's path is
            now the Manage Users dialog, which posts to POST /api/admin/users
            and is issued no token, so creating an account no longer signs the
            administrator out.

            WHY A SECOND LINK TO THE SAME PLACE. "Forgot password" above
            points at this same URL. That is deliberate, not a duplicate: a
            teacher whose account was just created has a TEMPORARY PASSWORD —
            the Manage Users form calls that field exactly that — and has
            forgotten nothing. "Forgot password" does not describe them, so
            they will not click it, and setting their own password is the
            first thing they need to do. Same mechanism, different sentence,
            for the person in the other state.

            IT IS NOT AN IN-PLACE CHANGE. Nobody is signed in on this screen,
            so the only thing that can be offered is the emailed link. The
            wording says what will happen rather than implying the current
            password is typed here — there is no authenticated endpoint for
            that, and inventing one on the login screen would be worse. */}
        <p className="auth-footer" style={{ marginTop: "1rem", textAlign: "center" }}>
          Given a temporary password by your administrator?{" "}
          <Link href="/login/forgot_password" className="link-orange">
            Change password
          </Link>
        </p>
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