"use client";
import { authService } from "@/services/authService";
import { useState } from "react";

interface Props { email?: string; }

export default function CheckEmailDialogBox({ email }: Props) {
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (email) {
      await authService.forgotPassword(email);
      setResent(true);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Check your email!</h2>
      <p style={styles.subtitle}>
        Thanks! An email was sent that will ask you to click on a link to verify that you own this account.
      </p>
      <button style={styles.button} onClick={() => window.open("mailto:", "_blank")}>
        Open email inbox
      </button>
      <p style={{ textAlign: "center", marginTop: 4 }}>
        <button onClick={handleResend} style={styles.resendBtn} disabled={resent}>
          {resent ? "Email resent!" : "Resend email"}
        </button>
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "#fff", borderRadius: 20, padding: "40px 36px", width: 320, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" },
  title: { color: "#1e3a5f", fontSize: 22, fontWeight: 700, marginBottom: 12 },
  subtitle: { color: "#555", fontSize: 13, marginBottom: 28 },
  button: { width: "100%", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 50, padding: "14px 0", fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 8 },
  resendBtn: { background: "none", border: "none", color: "#f59e0b", fontWeight: 600, fontSize: 13, cursor: "pointer" },
};