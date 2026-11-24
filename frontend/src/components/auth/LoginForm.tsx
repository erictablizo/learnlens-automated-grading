"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
// NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3, which names "Login".
import { advanceOnEnter } from "@/lib/formNav";

function LoginFormInner() {
  const { login, isLoading, error, setError } = useAuth();
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [justRegistered, setJustRegistered] = useState(false);

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
    if (!email.trim()) { setError("Please enter your email address."); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { setError("Please enter a valid email address."); return; }
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
              onKeyDown={e => { advanceOnEnter(e, e.currentTarget); }}>
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

        <p className="auth-footer">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="link-orange">Create an account</Link>
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