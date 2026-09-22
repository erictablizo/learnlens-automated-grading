"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import CheckEmailDialogBox from "@/components/auth/CheckEmailDialogBox";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

type View = "loading" | "form" | "sent" | "reset";

export default function ForgotPasswordForm() {
  const { forgotPassword, isLoading, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [view, setView] = useState<View>("loading");
  const [devMode, setDevMode] = useState(false);
  const [token, setToken] = useState("");

  // Added on 2026-09-22: Opened from the email link? → show the reset form
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    setView(t ? "reset" : "form");
  }, []);
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Please enter your email address."); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { setError("Please enter a valid email address."); return; }
    const res = await forgotPassword(email);
    // Commented out 2026-09-22:
    // if (res) {
    //   // Commented out 2026-09-22: tell the next page if the backend is in DEV MODE (no SMTP)
    //   // router.push(`/login/forgot_password/check_email?email=${encodeURIComponent(email)}`);
    //   const dev = res.email_sent ? "" : "&dev=1";
    //   router.push(
    //     `/login/forgot_password/check_email?email=${encodeURIComponent(email)}${dev}`
    //   );
    // }
    if (res) {
      setDevMode(!res.email_sent);
      setView("sent");                       // same page, no navigation → no 404
    }
  };
  // Addde on 2026-09-22:
  if (view === "loading") return <div className="auth-bg" />;
  if (view === "reset") return <ResetPasswordForm token={token} />;
  if (view === "sent") {
    return (
      <CheckEmailDialogBox
        email={email.trim()}
        devMode={devMode}
        onChangeEmail={() => { setView("form"); setError(null); }}
      />
    );
  }
 
  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1 className="auth-title">Forgot your password?</h1>
        <p className="auth-subtitle">
          Enter your email so that we can send you a password reset link
        </p>
 
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
 
          <button type="submit" className="btn-primary" disabled={isLoading} aria-busy={isLoading}>
            {isLoading ? <><span className="spinner" aria-hidden="true" /> Sending…</> : "Send email"}
          </button>
        </form>
 
        <p className="auth-footer" style={{ marginTop: "1rem" }}>
          <Link href="/login" className="link-orange">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}