"use client";
/**
 * "Check your email!" screen.
 * FIX 2026-09-23: gets the email as a PROP from ForgotPasswordForm (same page),
 * so it no longer needs its own /check_email route (that route gave 404).
 * If it is still rendered from an old check_email/page.tsx, it falls back to
 * reading ?email=…&dev=1 from the URL.
 *
 * ENHANCEMENT 2026-09-29: in DEV MODE the reset link is shown right here —
 * click "Open reset link" (or copy it) instead of digging it out of the
 * uvicorn terminal. Resending replaces the link, because only the newest
 * token works. `devResetUrl` comes from the backend and is only ever filled
 * in when SMTP is not configured.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { authService } from "@/services/authService";

const RESEND_WAIT = 30; // seconds between resends

interface Props {
  email?: string;
  devMode?: boolean;
  devResetUrl?: string | null;      // NEW 2026-09-29
  onChangeEmail?: () => void;
}

export default function CheckEmailDialogBox({
  email: emailProp, devMode: devProp, devResetUrl: devUrlProp, onChangeEmail,
}: Props) {
  const [email, setEmail] = useState(emailProp ?? "");
  const [devMode, setDevMode] = useState(!!devProp);
  const [devUrl, setDevUrl] = useState<string | null>(devUrlProp ?? null);   // NEW
  const [copied, setCopied] = useState(false);                              // NEW
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT);

  // Fallback for the old route: read ?email=…&dev=1
  useEffect(() => {
    if (emailProp) return;
    const q = new URLSearchParams(window.location.search);
    setEmail(q.get("email") ?? "");
    setDevMode(q.get("dev") === "1");
  }, [emailProp]);

  // Countdown before "Resend email" can be clicked again
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const handleResend = async () => {
    if (!email || loading || wait > 0) return;
    setLoading(true); setResent(false); setResendError(null); setCopied(false);
    try {
      const res = await authService.forgotPassword({ email });
      setDevMode(!res.email_sent);
      setDevUrl(res.dev_reset_url ?? null);     // NEW: the old link is dead now
      setResent(true);
      setWait(RESEND_WAIT);
    } catch (e: unknown) {
      setResendError(e instanceof Error ? e.message : "Could not resend the email.");
    } finally {
      setLoading(false);
    }
  };

  // NEW 2026-09-29
  const handleCopy = async () => {
    if (!devUrl) return;
    try {
      await navigator.clipboard.writeText(devUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);      // clipboard blocked — the link is selectable anyway
    }
  };

  const handleOpenInbox = () => {
    const domain = (email.split("@")[1] ?? "").toLowerCase();
    const webmails: Record<string, string> = {
      "gmail.com": "https://mail.google.com",
      "yahoo.com": "https://mail.yahoo.com",
      "outlook.com": "https://outlook.live.com",
      "hotmail.com": "https://outlook.live.com",
      "live.com": "https://outlook.live.com",
    };
    window.open(webmails[domain] ?? "https://mail.google.com", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1 className="auth-title">Check your email!</h1>
        <p className="auth-subtitle">
          We sent a password reset link to <strong>{email || "your email"}</strong>. Click the link to choose a new
          password. It expires in 60 minutes. Check your Spam folder if you don&apos;t see it.
        </p>

        {devMode && (
          <div role="status" className="alert alert-error" style={{ marginBottom: "1rem", textAlign: "left" }}>
            DEV MODE: no email was sent because SMTP is not set up in <code>backend/.env</code>.
            {devUrl ? (
              <>
                {" "}Use this reset link instead:
                <a
                  href={devUrl}
                  style={{
                    display: "block", margin: "0.6rem 0", padding: "0.5rem 0.6rem",
                    background: "#fff", border: "1px solid var(--border)", borderRadius: "6px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    fontSize: "0.72rem", lineHeight: 1.45, color: "var(--navy)",
                    wordBreak: "break-all", textDecoration: "none",
                  }}
                >
                  {devUrl}
                </a>
                <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <a href={devUrl} className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.9rem", textDecoration: "none" }}>
                    Open reset link
                  </a>
                  <button type="button" className="btn-secondary" onClick={handleCopy}
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.9rem", cursor: "pointer" }}>
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </span>
              </>
            ) : (
              <>
                {" "}Copy the reset link from the backend (uvicorn) terminal and open it in the browser.
              </>
            )}
          </div>
        )}
        {resent && !resendError && (
          <div role="status" aria-live="polite" className="alert alert-success" style={{ marginBottom: "1rem" }}>
            Email resent successfully! Only the newest link will work.
          </div>
        )}
        {resendError && (
          <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {resendError}
          </div>
        )}

        <button type="button" className="btn-primary" onClick={handleOpenInbox} style={{ marginBottom: "0.75rem" }}>
          Open email inbox
        </button>

        <p className="auth-footer">
          <button type="button" className="link-orange"
            style={{ background: "none", border: "none", cursor: wait > 0 ? "default" : "pointer" }}
            onClick={handleResend} disabled={loading || wait > 0 || !email} aria-busy={loading}>
            {loading ? "Resending…" : wait > 0 ? `Resend email (${wait}s)` : "Resend email"}
          </button>
        </p>
        <p className="auth-footer" style={{ marginTop: "0.5rem" }}>
          {onChangeEmail ? (
            <button type="button" className="link-orange" onClick={onChangeEmail}
              style={{ background: "none", border: "none", cursor: "pointer" }}>Use a different email</button>
          ) : (
            <Link href="/login/forgot_password" className="link-orange">Use a different email</Link>
          )}
          {" · "}
          <Link href="/login" className="link-orange">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}