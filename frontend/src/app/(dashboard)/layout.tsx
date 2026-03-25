"use client";
 
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, clearAuth } from "@/lib/auth";
 
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
 
function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
 
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
 
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);
 
  const handleSignOut = () => {
    clearAuth();
    router.push("/login");
  };
 
  return (
    <div className="dashboard-layout">
      {/* Shared sidebar for all dashboard pages */}
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-logo">
          <span>LearnLens</span>
        </div>
        <nav className="sidebar-nav">
          <Link href="/exams" className="sidebar-item">
            <GridIcon />
            <span>Manage Exams</span>
          </Link>
          <button className="sidebar-item" onClick={handleSignOut} aria-label="Sign out">
            <SignOutIcon />
            <span>Sign out</span>
          </button>
        </nav>
      </aside>
 
      {/* Page content */}
      <main className="dashboard-main">{children}</main>
    </div>
  );
}