"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
 
export default function RegisterForm() {
  const { register, isLoading, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Client-side validation before API call (HCI: error prevention)
    if (!email.trim()) { setError("Please enter your email."); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter a password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    await register(email, password);
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
 
          <div className="field">
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-label="Confirm password"
              disabled={isLoading}
            />
          </div>
 
          <button type="submit" className="btn-primary" disabled={isLoading} aria-busy={isLoading}>
            {isLoading ? <><span className="spinner" aria-hidden="true" /> Creating account…</> : "Sign up"}
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