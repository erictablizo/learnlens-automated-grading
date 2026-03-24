"use client";
 
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { getToken, getStoredUser, clearAuth } from "@/lib/auth";
import { User, LoginCredentials, RegisterCredentials } from "@/types/user";
 
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
 
  useEffect(() => {
    const storedUser = getStoredUser();
    const token = getToken();
    if (storedUser && token) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);
 
  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authService.login(credentials);
      setUser(data.user);
      router.push("/exams");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [router]);
 
  const register = useCallback(async (credentials: RegisterCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authService.register(credentials);
      setUser(data.user);
      router.push("/exams");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [router]);
 
  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    router.push("/login");
  }, [router]);
 
  return {
    user,
    isLoading,
    error,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    setError,
  };
}