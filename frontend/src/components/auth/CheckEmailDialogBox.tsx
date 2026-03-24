"use client";
 
import Link from "next/link";
import { authService } from "@/services/authService";
import { useState } from "react";
 
// SVG envelope icon
function EnvelopeIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}
 
export default function CheckEmailDialogBox() {
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
 
  // In a real scenario we'd have the email from query params or context
  const handleResend = async () => {
    setResending(true);
    try {
      // No-op in demo — in production, use stored email
      await new Promise((r) => setTimeout(r, 800));
      setResent(true);
    } finally {
      setResending(false);
    }
  };
 
  return (
    <div className="check-email-card">
      {/* HCI: Visual recognition — icon immediately communicates the context */}
      <div className="check-email-icon">
        <EnvelopeIcon />
      </div>
 
      <h1 className="auth-title">Check your email!</h1>
      <p className="auth-subtitle" style={{ marginBottom: "32px" }}>
        Thanks! An email was sent that will ask you to click on a link to verify
        that you own this account.
      </p>
 
      {/* HCI: Provide a primary action that is instantly accessible */}
      <a
        href="https://mail.google.com"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary"
        style={{ display: "flex", textDecoration: "none" }}
      >
        Open email inbox
      </a>
 
      {/* HCI: Resend as a secondary action — user control and freedom */}
      {resent ? (
        <p className="auth-footer" style={{ marginTop: "18px", color: "#276749" }}>
          ✓ Email resent successfully
        </p>
      ) : (
        <p className="auth-footer" style={{ marginTop: "18px" }}>
          <button
            onClick={handleResend}
            disabled={resending}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#e53e3e",
              fontWeight: 700,
              fontSize: "0.84rem",
            }}
          >
            {resending ? "Sending…" : "Resend email"}
          </button>
        </p>
      )}
    </div>
  );
}