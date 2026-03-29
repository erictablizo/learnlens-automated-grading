"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
 
export default function LoginForm() {
  const { login, isLoading, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Client-side error prevention before API call (HCI: error prevention)
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { setError("Please enter a valid email address."); return; }
    await login(email, password);
  };
 
  return (
    <div className="auth-bg">
      <div className="auth-card">
        <h1 className="auth-title">Login to your<br />account</h1>
 
        {/* aria-live for screen-reader feedback (HCI: visibility of system status) */}
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
              className={error && !email ? "error-input" : ""}
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
            {isLoading ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : "Sign in"}
          </button>
        </form>
 
        <p className="auth-footer">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="link-orange">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}