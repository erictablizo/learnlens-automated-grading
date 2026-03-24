"use client";
 
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
 
export default function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
 
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
 
    setIsLoading(true);
    try {
      await authService.forgotPassword({ email });
      // HCI: Closure — navigate to confirmation screen to signal action completed
      router.push("/login/forgot_password/check_email");
    } catch {
      // Always navigate to check email — prevents email enumeration, HCI: error prevention
      router.push("/login/forgot_password/check_email");
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <div className="auth-card">
      <h1 className="auth-title">Forgot your password?</h1>
      <p className="auth-subtitle">
        Enter your email so that we can send you a password reset link
      </p>
 
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
 
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? <span className="spinner" /> : "Send email"}
        </button>
      </form>
 
      {/* HCI: User control — always provide a back path */}
      <p className="auth-footer">
        <Link href="/login">Back to Login</Link>
      </p>
    </div>
  );
}