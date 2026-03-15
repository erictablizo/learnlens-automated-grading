"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await authService.forgotPassword(email);
      router.push(`/login/forgot_password/check_email?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Forgot your password?</h2>
      <p style={styles.subtitle}>Enter your email so that we can send you a password reset link</p>
      {error && <p style={styles.errorText}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input style={styles.input} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <button type="submit" style={styles.button} disabled={loading}>{loading ? "Sending…" : "Send email"}</button>
      </form>
      <p style={{ textAlign:"center", marginTop:8 }}>
        <Link href="/login" style={styles.link}>Back to Login</Link>
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background:"#fff", borderRadius:20, padding:"40px 36px", width:320, boxShadow:"0 4px 24px rgba(0,0,0,0.08)" },
  title: { color:"#1e3a5f", fontSize:20, fontWeight:700, textAlign:"center", marginBottom:8 },
  subtitle: { color:"#555", fontSize:13, textAlign:"center", marginBottom:24 },
  input: { width:"100%", border:"none", borderBottom:"1.5px solid #c8dce8", padding:"10px 0", marginBottom:20, fontSize:15, color:"#333", outline:"none", background:"transparent", boxSizing:"border-box" },
  button: { width:"100%", background:"#f59e0b", color:"#fff", border:"none", borderRadius:50, padding:"14px 0", fontSize:16, fontWeight:600, cursor:"pointer", marginBottom:8 },
  link: { color:"#f59e0b", fontWeight:600, textDecoration:"none", fontSize:13 },
  errorText: { color:"#e53e3e", fontSize:13, marginBottom:12, textAlign:"center" },
};