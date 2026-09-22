"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authService } from "@/services/authService";
 
// Added on 2026-09-22: wait time before allowing another resend
const RESEND_WAIT = 30; // seconds between resends

export default function CheckEmailDialogBox() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  // Added on 2026-09-22: 
  const [devMode, setDevMode] = useState(params.get("dev") === "1");
  const [resent, setResent] = useState(false);
  // Added on 2026-09-22:
  const [resendError, setResendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Added on 2026-09-22: 
  const [wait, setWait] = useState(RESEND_WAIT);
 
  // Commented out 2026-09-22: the old version had no catch, so a failed resend crashed the page.
  // const handleResend = async () => {
  //   if (!email || loading) return;
  //   setLoading(true);
  //   try {
  //     await authService.forgotPassword({ email });
  //     setResent(true);
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  const handleResend = async () => {
    if (!email || loading || wait > 0) return;
    setLoading(true); setResent(false); setResendError(null);
    try {
      const res = await authService.forgotPassword({ email });
      setDevMode(!res.email_sent);
      setResent(true);
      setWait(RESEND_WAIT);
    } catch (e: unknown) {
      setResendError(e instanceof Error ? e.message : "Could not resend the email.");
    } finally {
      setLoading(false);
    }
  };
 
  const handleOpenInbox = () => {
    // Best-effort: open webmail if we recognise the domain
    const domain = email.split("@")[1] ?? "";
    const webmails: Record<string, string> = {
      "gmail.com": "https://mail.google.com",
      "yahoo.com": "https://mail.yahoo.com",
      "outlook.com": "https://outlook.live.com",
      "hotmail.com": "https://outlook.live.com",
    };
    const url = webmails[domain] ?? `https://${domain}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
 
  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1 className="auth-title">Check your email!</h1>
        <p className="auth-subtitle">
          Thanks! An email was sent that will ask you to click on a link to verify that you own this account.
        </p>
 
        {resent && (
          <div role="status" aria-live="polite" className="alert alert-success" style={{ marginBottom: "1rem" }}>
            Email resent successfully!
          </div>
        )}
 
        <button className="btn-primary" onClick={handleOpenInbox} style={{ marginBottom: "0.75rem" }}>
          Open email inbox
        </button>
 
        <p className="auth-footer">
          <button
            className="link-orange"
            style={{ background: "none", border: "none", cursor: "pointer" }}
            onClick={handleResend}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Resending…" : "Resend email"}
          </button>
        </p>
      </div>
    </div>
  );
}