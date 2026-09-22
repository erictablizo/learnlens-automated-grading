"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { setAuth, clearAuth, getToken, getUser } from "@/lib/auth";
import { clearActiveCollege } from "@/lib/college";
import { ForgotPasswordResponse } from "@/types/user";
 
export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
 
  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) { setError("Email and password are required."); return; }
    setIsLoading(true); setError(null);
    try {
      const data = await authService.login({ email, password });
      setAuth(data.access_token, data.user);
      if (!data.profile_complete) {
        // First-time user — go to profile setup, then college picker
        router.replace("/setup");
      } else {
        // Existing user — go straight to college picker every session
        router.replace("/college");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally { setIsLoading(false); }
  }, [router]);
 
  const register = useCallback(async (email: string, password: string) => {
    if (!email || !password) { setError("All fields are required."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setIsLoading(true); setError(null);
    try {
      const data = await authService.register({ email, password });
      setAuth(data.access_token, data.user);
      // New user always goes to profile setup first
      router.replace("/setup");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally { setIsLoading(false); }
  }, [router]);
 
  // Commented out 2026-09-22: FIX 2026-09-22: returns the server response (or null) instead of true/false, so the Check Email page knows whether the email was really sent.
  // const forgotPassword = useCallback(async (email: string): Promise<boolean> => {
  //   if (!email) { setError("Email is required."); return false; }
  //   setIsLoading(true); setError(null);
  //   try {
  //     await authService.forgotPassword({ email });
  //     return true;
  //   } catch (e: unknown) {
  //     setError(e instanceof Error ? e.message : "Request failed");
  //     return false;
  //   } finally { setIsLoading(false); }
  // }, []);
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