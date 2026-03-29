"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
 
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(isAuthenticated() ? "/exams" : "/login");
  }, [router]);
  return (
    <div className="auth-bg">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <span className="spinner spinner-dark" />
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading LearnLens…</span>
      </div>
    </div>
  );
}