"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";

export default function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await authService.register(email, password);
      router.push("/login");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Registration failed.");
    } finally { setLoading(false); }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Create new account</h2>
      {error && <p style={styles.errorText}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input style={styles.input} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <input style={styles.input} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
        <input style={styles.input} type="password" placeholder="Confirm Password" value={confirm} onChange={e=>setConfirm(e.target.value)} required />
        <button type="submit" style={styles.button} disabled={loading}>{loading ? "Signing up…" : "Sign up"}</button>
      </form>
      <p style={styles.footer}>Already have an account? <Link href="/login" style={styles.link}>Login</Link></p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background:"#fff", borderRadius:20, padding:"40px 36px", width:340, boxShadow:"0 4px 24px rgba(0,0,0,0.08)" },
  title: { color:"#1e3a5f", fontSize:22, fontWeight:700, textAlign:"center", marginBottom:28 },
  input: { width:"100%", border:"none", borderBottom:"1.5px solid #c8dce8", padding:"10px 0", marginBottom:18, fontSize:15, color:"#333", outline:"none", background:"transparent", boxSizing:"border-box" },
  button: { width:"100%", background:"#f59e0b", color:"#fff", border:"none", borderRadius:50, padding:"14px 0", fontSize:16, fontWeight:600, cursor:"pointer", marginBottom:16 },
  footer: { textAlign:"center", fontSize:13, color:"#555" },
  link: { color:"#f59e0b", fontWeight:600, textDecoration:"none" },
  errorText: { color:"#e53e3e", fontSize:13, marginBottom:12, textAlign:"center" },
};