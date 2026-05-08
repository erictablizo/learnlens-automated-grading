"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { setAuth, clearAuth, getToken, getUser } from "@/lib/auth";
 
export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  /** After successful auth, check profile and route accordingly */
  const routeAfterAuth = useCallback(async (token: string) => {
    try {
      const { has_profile } = await profileService.check(token);
      router.replace(has_profile ? "/exams" : "/profile-setup");
    } catch {
      // If check fails (e.g. backend offline), go straight to exams
      router.replace("/exams");
    }
  }, [router]);
 
  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) { setError("Email and password are required."); return; }
    setIsLoading(true); setError(null);
    try {
      const data = await authService.login({ email, password });
      setAuth(data.access_token, data.user);
      await routeAfterAuth(data.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally { setIsLoading(false); }
  }, [routeAfterAuth]);
 
  const register = useCallback(async (email: string, password: string) => {
    if (!email || !password) { setError("All fields are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setIsLoading(true); setError(null);
    try {
      const data = await authService.register({ email, password });
      setAuth(data.access_token, data.user);
      // New user — always go to profile setup
      router.replace("/profile-setup");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally { setIsLoading(false); }
  }, [router]);
 
  const forgotPassword = useCallback(async (email: string): Promise<boolean> => {
    if (!email) { setError("Email is required."); return false; }
    setIsLoading(true); setError(null);
    try {
      await authService.forgotPassword({ email });
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally { setIsLoading(false); }
  }, []);
 
  const logout = useCallback(() => {
    clearAuth();
    router.replace("/login");
  }, [router]);
 
  return { login, register, forgotPassword, logout, isLoading, error, setError, getToken, getUser };
}