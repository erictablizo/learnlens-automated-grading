"use client";
/**
 * "Choose a new password" screen, opened from the link in the email:
 *     /login/forgot_password?token=…
 * FIX 2026-09-23: token comes as a PROP from ForgotPasswordForm (same page),
 * so no separate /reset_password route is needed. Falls back to ?token= in the URL.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/authService";

export default function ResetPasswordForm({ token: tokenProp }: { token?: string }) {
  const router = useRouter();
  const { resetPassword, isLoading, error, setError } = useAuth();

  const [token, setToken] = useState(tokenProp ?? "");
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = tokenProp || new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) {
      setLinkError("This reset link is incomplete. Please request a new one.");
      setChecking(false);
      return;
    }
    authService.validateResetToken(t)
      .then(r => setEmail(r.email))
      .catch((e: unknown) => setLinkError(e instanceof Error ? e.message : "This reset link is invalid or has expired."))
      .finally(() => setChecking(false));
  }, [tokenProp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) { setError("Please enter a new password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (await resetPassword(token, password)) {
      setDone(true);
      setTimeout(() => router.replace("/login"), 2500);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1 className="auth-title">Reset your password</h1>

        {checking && (
          <p className="auth-subtitle"><span className="spinner spinner-dark" aria-hidden="true" /> Checking your link…</p>
        )}

        {!checking && linkError && (
          <>
            <div role="alert" className="alert alert-error">{linkError}</div>
            <p className="auth-footer" style={{ marginTop: "1rem" }}>
              <a href="/login/forgot_password" className="link-orange">Request a new link</a>
            </p>
          </>
        )}

        {!checking && !linkError && done && (
          <div role="status" aria-live="polite" className="alert alert-success">
            Your password has been changed. Redirecting to login…
          </div>
        )}

        {!checking && !linkError && !done && (
          <>
            <p className="auth-subtitle">Choose a new password for <strong>{email}</strong></p>
            {error && <div role="alert" aria-live="assertive" className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <input type="password" placeholder="New password (min. 8 characters)" value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="new-password"
                  aria-label="New password" disabled={isLoading} />
              </div>
              <div className="field">
                <input type="password" placeholder="Confirm new password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
                  aria-label="Confirm new password" disabled={isLoading} />
              </div>
              <button type="submit" className="btn-primary" disabled={isLoading} aria-busy={isLoading}>
                {isLoading ? <><span className="spinner" aria-hidden="true" /> Saving…</> : "Reset password"}
              </button>
            </form>
          </>
        )}

        <p className="auth-footer" style={{ marginTop: "1rem" }}>
          <Link href="/login" className="link-orange">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}