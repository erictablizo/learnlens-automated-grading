"use client";
 
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
 
export default function RegisterForm() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
 
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
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
      <h1 className="title">Create new account</h1>
 
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
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input"
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="input"
        />
 
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
 
      <p className="footer-text">
        Already have an account?{" "}
        <Link href="/login" className="link-orange">
          Login
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
          margin-top: 8px;
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
        .link-orange {
          color: #f5a623;
          text-decoration: none;
          font-weight: 500;
        }
        .link-orange:hover { text-decoration: underline; }
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