"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { setAuth, clearAuth, getToken, getUser } from "@/lib/auth";
import { clearActiveCollege } from "@/lib/college";
import { checkPassword } from "@/lib/password";
import { ForgotPasswordResponse } from "@/types/user";

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) { setError("Email and password are required."); return; }
    // NOTE 2026-10-22: there is deliberately NO password rule here. The
    // character classes govern CHOOSING a password, never checking one, so
    // every existing account keeps working. Same decision as the 72-byte
    // bcrypt cap on 2 Oct, for the same reason.
    setIsLoading(true); setError(null);
    try {
      const data = await authService.login({ email, password });
      setAuth(data.access_token, data.user);
      // CHANGED 2026-10-04: an existing user goes straight to Manage Exams.
      // The college / course / year screens are no longer part of signing in —
      // they only appear after clicking "Switch" in the sidebar. The active
      // college comes from the saved profile instead (see lib/college.ts →
      // ensureActiveCollege, called by the sidebar).
      router.replace(data.profile_complete ? "/exams" : "/setup");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally { setIsLoading(false); }
  }, [router]);

  const register = useCallback(async (email: string, password: string) => {
    if (!email || !password) { setError("All fields are required."); return; }
    // FIX 2026-10-22: this was the THIRD independent copy of the 8-character
    // rule — RegisterForm and ResetPasswordForm had the other two, and
    // schemas/user.py had the real one. On 1 Oct the API and this file had
    // already drifted apart once (Register accepted a 2-character password).
    // One shared rule now, same order and same words as the server.
    const pwError = checkPassword(password);
    if (pwError) { setError(pwError); return; }
    setIsLoading(true); setError(null);
    try {
      const data = await authService.register({ email, password });
      setAuth(data.access_token, data.user);
      router.replace("/setup");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally { setIsLoading(false); }
  }, [router]);

  // FIX 2026-09-22: returns the server response (or null) instead of true/false,
  // so the Check Email page knows whether the email was really sent.
  const forgotPassword = useCallback(async (email: string): Promise<ForgotPasswordResponse | null> => {
    if (!email.trim()) { setError("Email is required."); return null; }
    setIsLoading(true); setError(null);
    try {
      return await authService.forgotPassword({ email: email.trim() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally { setIsLoading(false); }
  }, []);

  // NEW 2026-09-22
  const resetPassword = useCallback(async (token: string, newPassword: string): Promise<boolean> => {
    // FIX 2026-10-22: ResetPasswordForm checks before calling this, but this
    // hook is callable on its own, so it checks too. Cheap, and it means the
    // rule cannot be bypassed by a future caller that forgets.
    const pwError = checkPassword(newPassword);
    if (pwError) { setError(pwError); return false; }
    setIsLoading(true); setError(null);
    try {
      await authService.resetPassword(token, newPassword);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reset the password.");
      return false;
    } finally { setIsLoading(false); }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  }, [router]);

  return { login, register, forgotPassword, resetPassword, logout, isLoading, error, setError, getToken, getUser };
}