"use client";
 
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
 
export default function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
 
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
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
      <h1 className="title">Login to your<br />account</h1>
 
      {error && <p className="error-msg">{error}</p>}
 
      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
        </div>
 
        <div className="field">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input"
          />
          <div className="forgot-row">
            <Link href="/login/forgot_password" className="link-orange">
              Forgot password
            </Link>
          </div>
        </div>
 
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
 
      <p className="footer-text">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="link-orange">
          Create an account
        </Link>
      </p>
 
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
          font-size: 1.5rem;
          font-weight: 700;
          color: #1a2e4a;
          text-align: center;
          margin-bottom: 28px;
          line-height: 1.3;
        }
        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .field {
          display: flex;
          flex-direction: column;
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
        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 6px;
        }
        .link-orange {
          color: #f5a623;
          font-size: 0.85rem;
          text-decoration: none;
          font-weight: 500;
        }
        .link-orange:hover { text-decoration: underline; }
        .btn-primary {
          margin-top: 4px;
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
        .footer-text {
          margin-top: 18px;
          font-size: 0.85rem;
          color: #6b7a8d;
        }
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