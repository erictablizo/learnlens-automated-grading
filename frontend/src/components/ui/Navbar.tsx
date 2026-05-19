"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getToken } from "@/lib/auth";
import { clearActiveCollege, getActiveCollege, COLLEGE_COLORS } from "@/lib/college";
import { College } from "@/types/profile";
import { profileService } from "@/services/profileService";
 
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
  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);
 
export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
 
  const [college,     setCollege]     = useState<College | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
 
  // Load profile for display name on mount and route changes
  useEffect(() => {
    const col = getActiveCollege();
    setCollege(col);
 
    const token = getToken();
    if (!token) return;
 
    profileService.get(token).then(profile => {
      if (!profile) return;
      const first    = profile.first_name ?? "";
      const last     = profile.last_name  ?? "";
      const fullName = [first, last].filter(Boolean).join(" ");
      const course   = profile.course ?? "";
      const position = profile.position ? ` ${profile.position}` : " Teacher";
      // Format: "Maria Santos, Computer Science Teacher"
      if (fullName && course) {
        setDisplayName(`${fullName}, ${course}${position}`);
      } else if (fullName) {
        setDisplayName(`${fullName}${position}`);
      }
    }).catch(() => {});
  }, [pathname]);
 
  const handleSignOut = () => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  };
 
  const col = college ? COLLEGE_COLORS[college] : null;
 
  return (
    <nav className="sidebar" aria-label="Main navigation">
 
      {/* College badge + user identity */}
      {college && col && (
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           "0.35rem",
            padding:       "0.75rem 0.5rem 0.9rem",
            marginBottom:  "0.4rem",
            borderBottom:  "1px solid var(--border)",
            width:         "100%",
          }}
        >
          {/* Initials circle */}
          <div
            style={{
              width:          48, height: 48,
              borderRadius:   "50%",
              background:     col.bg, color: col.color,
              display:        "flex", alignItems: "center", justifyContent: "center",
              fontSize:       "1rem", fontWeight: 700,
              fontFamily:     "var(--font-heading)",
            }}
            aria-hidden="true"
          >
            {col.initials}
          </div>
 
          {/* College abbreviation */}
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--navy)" }}>
            {college}
          </span>
 
          {/* Name, Course Teacher */}
          {displayName && (
            <span
              style={{
                fontSize:   "0.7rem",
                color:      "var(--text-muted)",
                textAlign:  "center",
                lineHeight: 1.4,
                wordBreak:  "break-word",
              }}
            >
              {displayName}
            </span>
          )}
 
          {/* Switch college */}
          <button
            className="sidebar-item"
            onClick={() => router.push("/college")}
            style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", color: "var(--text-muted)", gap: "0.3rem", marginTop: "0.2rem" }}
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