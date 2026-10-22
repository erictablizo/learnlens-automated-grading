"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { checkPassword, passwordRules } from "@/lib/password";
 
export default function RegisterForm() {
  const { register, isLoading, error, setError } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Client-side validation before any API call (HCI: error prevention)
    // CHANGED 2026-10-22: was "Please enter your email." Forgot Password says
    // "...your email address." for the same condition, two screens away.
    if (!email.trim()) { setError("Please enter your email address."); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter a password."); return; }
    // FIX 2026-10-22 (Doc Rubrica): UPPERCASE, lowercase and a special
    // character. One shared rule, same order and same words as
    // _validate_password() in schemas/user.py.
    const pwError = checkPassword(password);
    if (pwError) { setError(pwError); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    await register(email, password);
    // useAuth.register() signs the teacher in and redirects to /setup
  };
 
  return (
    <div className="auth-bg">
      <div className="auth-card">
        <h1 className="auth-title">Create new account</h1>
 
        {error && (
          <div role="alert" aria-live="assertive" className="alert alert-error">
            {error}
          </div>
        )}
 
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <input
              type="email"
              placeholder="Email"
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
              autoComplete="new-password"
              aria-label="Password"
              disabled={isLoading}
            />
          </div>
 
          {/* NEW 2026-10-22: the rules are no longer guessable from "8
              characters", so show them instead of only refusing on submit.
              Only once the teacher starts typing, so an empty form is not
              a wall of red. */}
          {password && (
            <ul aria-live="polite" style={{
              listStyle: "none", padding: 0, margin: "-0.6rem 0 1rem",
              fontSize: "0.74rem", lineHeight: 1.7,
            }}>
              {passwordRules(password).map(r => (
                <li key={r.id} style={{ color: r.ok ? "var(--success, #2e7d32)" : "var(--text-muted)" }}>
                  <span aria-hidden="true">{r.ok ? "✓" : "○"}</span> {r.label}
                </li>
              ))}
            </ul>
          )}
 
          <div className="field">
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-label="Confirm password"
              disabled={isLoading}
            />
          </div>
 
          <button type="submit" className="btn-primary" disabled={isLoading} aria-busy={isLoading}>
            {isLoading
              ? <><span className="spinner" aria-hidden="true" /> Creating account…</>
              : "Sign up"}
          </button>
        </form>
 
        <p className="auth-footer">
          Already have an account?{" "}
          <Link href="/login" className="link-orange">Login</Link>
        </p>
      </div>
    </div>
  );
}