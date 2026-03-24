"use client";
 
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { ApiError } from "@/lib/api";
 
export default function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
 
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = "Enter a valid email.";
    if (!password) errors.password = "Password is required.";
    else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
 
    // HCI: Error prevention — validate before API call
    if (!validate()) return;
 
    setIsLoading(true);
    try {
      await authService.register({ email, password, confirmPassword });
      router.push("/exams");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 400
            ? "An account with this email already exists."
            : err.message
          : "Registration failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <div className="auth-card">
      <h1 className="auth-title">Create new account</h1>
 
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
          {fieldErrors.email && (
            <span className="form-error">{fieldErrors.email}</span>
          )}
        </div>
 
        <div className="form-group">
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-label="Password"
            disabled={isLoading}
          />
          {fieldErrors.password && (
            <span className="form-error">{fieldErrors.password}</span>
          )}
        </div>
 
        <div className="form-group">
          <input
            className="form-input"
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            aria-label="Confirm password"
            disabled={isLoading}
          />
          {fieldErrors.confirmPassword && (
            <span className="form-error">{fieldErrors.confirmPassword}</span>
          )}
        </div>
 
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? <span className="spinner" /> : "Sign up"}
        </button>
      </form>
 
      <p className="auth-footer">
        Already have an account?{" "}
        <Link href="/login">Login</Link>
      </p>
    </div>
  );
}