"use client";
 
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { ApiError } from "@/lib/api";
 
export default function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
 
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      router.push("/login/forgot_password/check_email");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }
 
  return (
    <div className="card">
      <h1 className="title">Forgot your password?</h1>
      <p className="subtitle">
        Enter your email so that we can send you a password reset link
      </p>
 
      {error && <p className="error-msg">{error}</p>}
 
      <form onSubmit={handleSubmit} className="form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input"
        />
 
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Sending…" : "Send email"}
        </button>
      </form>
 
      <Link href="/login" className="link-orange back-link">
        Back to Login
      </Link>
 
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
          margin-bottom: 10px;
        }
        .subtitle {
          font-size: 0.85rem;
          color: #6b7a8d;
          text-align: center;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .input {
          width: 100%;
          border: none;
          border-bottom: 1.5px solid #c8d6e5;
          outline: none;
          padding: 8px 0;
          font-size: 0.95rem;
          color: #333;
          background: transparent;
          transition: border-color 0.2s;
        }
        .input::placeholder { color: #aab8c8; }
        .input:focus { border-bottom-color: #f5a623; }
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
          transition: background 0.2s, opacity 0.2s;
        }
        .btn-primary:hover { background: #e09610; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .back-link {
          margin-top: 16px;
          font-size: 0.85rem;
          color: #f5a623;
          text-decoration: none;
          font-weight: 500;
        }
        .back-link:hover { text-decoration: underline; }
        .link-orange { color: #f5a623; }
        .error-msg {
          color: #e74c3c;
          font-size: 0.85rem;
          margin-bottom: 8px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}