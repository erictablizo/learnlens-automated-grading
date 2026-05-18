"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getToken } from "@/lib/auth";
import { clearActiveCollege, getActiveCollege, COLLEGE_COLORS } from "@/lib/college";
import { College } from "@/types/profile";
import { UserProfile } from "@/types/profile";
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
 
  const [college, setCollege] = useState<College | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
 
  useEffect(() => {
    setCollege(getActiveCollege());
    // Load profile to display name + position
    const token = getToken();
    if (token) {
      profileService.get(token)
        .then(p => setProfile(p))
        .catch(() => setProfile(null));
    }
  }, [pathname]);
 
  const handleSignOut = () => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  };
 
  // Build display name: "Last Name, First Name · Position"
  const displayName = (() => {
    if (!profile?.first_name && !profile?.last_name) return null;
    const name = [profile.last_name, profile.first_name].filter(Boolean).join(", ");
    return profile.position ? `${name}` : name;
  })();
 
  const col = college ? COLLEGE_COLORS[college] : null;
 
  return (
    <nav className="sidebar" aria-label="Main navigation">
 
      {/* User identity block */}
      {(displayName || college) && (
        <div style={{
          padding:       "0.75rem 0.5rem 1rem",
          marginBottom:  "0.25rem",
          borderBottom:  "1px solid var(--border)",
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           "0.4rem",
          textAlign:     "center",
        }}>
          {/* College initials avatar */}
          {col && college && (
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: col.bg, color: col.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.85rem", fontWeight: 700,
              fontFamily: "var(--font-heading)",
            }} aria-hidden="true">
              {col.initials}
            </div>
          )}
 
          {/* Last Name, First Name */}
          {displayName && (
            <span style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "var(--navy)",
              lineHeight: 1.3,
            }}>
              {displayName}
            </span>
          )}
 
          {/* Position */}
          {profile?.position && (
            <span style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}>
              {profile.position}
            </span>
          )}
 
          {/* College abbreviation + switch link */}
          {college && (
            <button
              className="sidebar-item"
              onClick={() => router.push("/college")}
              aria-label="Switch college"
              style={{
                fontSize:  "0.72rem",
                padding:   "0.2rem 0.6rem",
                color:     "var(--text-muted)",
                gap:       "0.3rem",
                marginTop: "0.1rem",
              }}
            >
              <IconSwitch />
              {college} · Switch
            </button>
          )}
        </div>
      )}
 
      {/* Nav links */}
      <Link
        href="/exams"
        className={`sidebar-item${pathname.startsWith("/exams") ? " active" : ""}`}
        aria-current={pathname.startsWith("/exams") ? "page" : undefined}
      >
        <IconList />
        Manage Exams
      </Link>
 
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