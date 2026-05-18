"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { setAuth, clearAuth, getToken, getUser } from "@/lib/auth";
import { clearActiveCollege } from "@/lib/college";
 
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
      // First-time (no profile) → /setup  |  Returning → /college
      router.replace(data.profile_complete ? "/college" : "/setup");
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
      // After register → go back to login so they sign in and hit /setup
      router.replace("/login");
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
    clearActiveCollege();
    router.replace("/login");
  }, [router]);
 
  return { login, register, forgotPassword, logout, isLoading, error, setError, getToken, getUser };
}