"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth } from "@/lib/auth";
 
const IconList = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);
const IconLogout = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
  </svg>
);
 
export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
 
  const handleSignOut = () => {
    clearAuth();
    router.replace("/login");
  };
 
  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Manage Exams link */}
      <Link
        href="/exams"
        className={`sidebar-item${pathname.startsWith("/exams") ? " active" : ""}`}
        aria-current={pathname.startsWith("/exams") ? "page" : undefined}
      >
        <IconList />
        Manage Exams
      </Link>
 
      {/* Sign out sits directly below — no auto margin push to bottom */}
      <button
        className="sidebar-item signout"
        onClick={handleSignOut}
        aria-label="Sign out"
      >
        <IconLogout />
        Sign out
      </button>
    </nav>
  );
}