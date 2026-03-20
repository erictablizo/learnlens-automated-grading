"use client";
 
import { useState } from "react";
import { authService } from "@/services/authService";
 
interface CheckEmailDialogBoxProps {
  email?: string;
}
 
export default function CheckEmailDialogBox({ email }: CheckEmailDialogBoxProps) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
 
  async function handleResend() {
    if (!email) return;
    setResending(true);
    try {
      await authService.forgotPassword(email);
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } finally {
      setResending(false);
    }
  }
 
  function handleOpenInbox() {
    window.open("mailto:", "_blank");
  }
 
  return (
    <div className="card">
      <h1 className="title">Check your email!</h1>
      <p className="subtitle">
        Thanks! An email was sent that will ask you to click on a link to verify
        that you own this account.
      </p>
 
      <button onClick={handleOpenInbox} className="btn-primary">
        Open email inbox
      </button>
 
      <button
        onClick={handleResend}
        disabled={resending || !email}
        className="link-orange resend-btn"
      >
        {resending ? "Resending…" : resent ? "Email sent!" : "Resend email"}
      </button>
 
      <style jsx>{`
        .card {
          background: #fff;
          border-radius: 20px;
          padding: 40px 44px 36px;
          width: 100%;
          max-width: 360px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.07);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .title {
          font-size: 1.4rem;
          font-weight: 700;
          color: #1a2e4a;
          text-align: center;
          margin-bottom: 12px;
        }
        .subtitle {
          font-size: 0.85rem;
          color: #6b7a8d;
          text-align: center;
          margin-bottom: 28px;
          line-height: 1.55;
        }
        .btn-primary {
          width: 100%;
          background: #f5a623;
          color: #fff;
          border: none;
          border-radius: 50px;
          padding: 13px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-primary:hover { background: #e09610; }
        .resend-btn {
          margin-top: 14px;
          background: none;
          border: none;
          color: #f5a623;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          padding: 0;
        }
        .resend-btn:hover { text-decoration: underline; }
        .resend-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .link-orange { color: #f5a623; }
      `}</style>
    </div>
  );
}