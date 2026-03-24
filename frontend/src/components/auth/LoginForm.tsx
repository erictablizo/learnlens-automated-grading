"use client";
 
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { ApiError } from "@/lib/api";
 
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
 
    // HCI: Basic client-side validation — error prevention before server call
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
 
    setIsLoading(true);
    try {
      await authService.login({ email, password });
      // HCI: Immediate feedback — navigate to dashboard on success
      router.push("/exams");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? "Incorrect email or password. Please try again."
            : err.message
          : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <div className="auth-card">
      <h1 className="auth-title">Login to your<br />account</h1>
 
      {/* HCI: Informative feedback — error alert is immediately visible */}
      {error && (
        <div className="alert alert-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}
 
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <input
            className="form-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-label="Email address"
            disabled={isLoading}
          />
        </div>
 
        <div className="form-group">
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-label="Password"
            disabled={isLoading}
          />
        </div>
 
        {/* HCI: Recognition — forgot password is visible without searching */}
        <div className="form-actions-row">
          <Link href="/login/forgot_password" className="forgot-link">
            Forgot password
          </Link>
        </div>
 
        {/* HCI: Clear CTA — button label matches the action */}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? <span className="spinner" /> : "Sign in"}
        </button>
      </form>
 
      {/* HCI: Self-descriptiveness — users know they can create an account */}
      <p className="auth-footer">
        Don&apos;t have an account?{" "}
        <Link href="/register">Create an account</Link>
      </p>
    </div>
  );
}