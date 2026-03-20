"use client";
 
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { getUser, isAuthenticated, clearAuth } from "@/lib/auth";
import { User } from "@/types/user";
 
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
 
  useEffect(() => {
    if (isAuthenticated()) {
      setUser(getUser());
    }
    setLoading(false);
  }, []);
 
  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authService.login({ email, password });
      setUser(data.user);
      router.push("/exams");
    },
    [router]
  );
 
  const register = useCallback(
    async (email: string, password: string) => {
      const data = await authService.register(email, password);
      setUser(data.user);
      router.push("/exams");
    },
    [router]
  );
 
  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    router.push("/login");
  }, [router]);
 
  return { user, loading, login, register, logout, isAuthenticated: !!user };
}