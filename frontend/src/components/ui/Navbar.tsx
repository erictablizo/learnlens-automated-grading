"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth } from "@/lib/auth";
import { clearActiveCollege, getActiveCollege, COLLEGE_COLORS } from "@/lib/college";
import { useEffect, useState } from "react";
import { College } from "@/types/profile";
 
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
const IconSwitch = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);
 
export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [college, setCollege] = useState<College | null>(null);
 
  useEffect(() => { setCollege(getActiveCollege()); }, [pathname]);
 
  const handleSignOut = () => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  };
 
  const handleSwitchCollege = () => router.push("/college");
 
  const col = college ? COLLEGE_COLORS[college] : null;
 
  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Active college badge */}
      {college && col && (
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           "0.4rem",
            padding:       "0.75rem 0.5rem",
            marginBottom:  "0.5rem",
            borderBottom:  "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width:          44,
              height:         44,
              borderRadius:   "50%",
              background:     col.bg,
              color:          col.color,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       "0.9rem",
              fontWeight:     700,
              fontFamily:     "var(--font-heading)",
            }}
            aria-hidden="true"
          >
            {col.initials}
          </div>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--navy)" }}>
            {college}
          </span>
          <button
            className="sidebar-item"
            onClick={handleSwitchCollege}
            style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", color: "var(--text-muted)", gap: "0.3rem" }}
            aria-label="Switch college"
          >
            <IconSwitch /> Switch
          </button>
        </div>
      )}
 
      <Link
        href="/exams"
        className={`sidebar-item${pathname.startsWith("/exams") ? " active" : ""}`}
        aria-current={pathname.startsWith("/exams") ? "page" : undefined}
      >
        <IconList />
        Manage Exams
      </Link>
 
      <button className="sidebar-item signout" onClick={handleSignOut} aria-label="Sign out">
        <IconLogout />
        Sign out
      </button>
    </nav>
  );
}