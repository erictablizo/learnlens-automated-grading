"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getToken } from "@/lib/auth";
import { clearActiveCollege, getActiveCollege, COLLEGE_COLORS } from "@/lib/college";
import { College, UserProfile } from "@/types/profile";
import { profileService } from "@/services/profileService";
 
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");
 
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
 
/** Build the avatar URL from the stored path */
function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  // path is like "uploads/avatars/user_1.jpg" — prepend the backend base
  return `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
}
 
/** Build "Maria Santos, Computer Science Teacher" */
function buildDisplayName(profile: UserProfile): string {
  const first    = (profile.first_name ?? "").trim();
  const last     = (profile.last_name  ?? "").trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  const course   = (profile.course    ?? "").trim();
  const position = (profile.position  ?? "").trim() || "Teacher";
 
  if (fullName && course) return `${fullName}, ${course} ${position}`;
  if (fullName)           return `${fullName} ${position}`;
  return position;
}
 
export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
 
  const [college,     setCollege]     = useState<College | null>(null);
  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [imgError,    setImgError]    = useState(false);
 
  useEffect(() => {
    setCollege(getActiveCollege());
    setImgError(false);
 
    const token = getToken();
    if (!token) return;
    profileService.get(token)
      .then(p => { setProfile(p); setImgError(false); })
      .catch(() => {});
  }, [pathname]);
 
  const handleSignOut = () => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  };
 
  const col         = college ? COLLEGE_COLORS[college] : null;
  const displayName = profile ? buildDisplayName(profile) : null;
  const avatarSrc   = profile ? avatarUrl(profile.avatar_path) : null;
 
  // Initials fallback
  const initials = profile
    ? [(profile.first_name ?? "")[0], (profile.last_name ?? "")[0]]
        .filter(Boolean).join("").toUpperCase() || "?"
    : col?.initials ?? "?";
 
  return (
    <nav className="sidebar" aria-label="Main navigation">
 
      {/* ── Profile section ── */}
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           "0.4rem",
          padding:       "0.9rem 0.5rem 0.85rem",
          marginBottom:  "0.4rem",
          borderBottom:  "1px solid var(--border)",
          width:         "100%",
        }}
      >
        {/* Avatar — photo if available, initials circle otherwise */}
        <div
          style={{
            width:        52,
            height:       52,
            borderRadius: "50%",
            overflow:     "hidden",
            border:       "2px solid var(--border)",
            flexShrink:   0,
            background:   col?.bg ?? "var(--bg)",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          {avatarSrc && !imgError ? (
            <img
              src={avatarSrc}
              alt="Profile"
              onError={() => setImgError(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{
              fontSize:   "1rem",
              fontWeight: 700,
              color:      col?.color ?? "var(--text-muted)",
              fontFamily: "var(--font-heading)",
            }}>
              {initials}
            </span>
          )}
        </div>
 
        {/* College abbreviation badge */}
        {college && col && (
          <span style={{
            fontSize:       "0.72rem",
            fontWeight:     700,
            color:          col.color,
            background:     col.bg,
            borderRadius:   "20px",
            padding:        "1px 8px",
            letterSpacing:  "0.03em",
          }}>
            {college}
          </span>
        )}
 
        {/* "Maria Santos, Computer Science Teacher" */}
        {displayName && (
          <span style={{
            fontSize:   "0.68rem",
            color:      "var(--text-muted)",
            textAlign:  "center",
            lineHeight: 1.45,
            wordBreak:  "break-word",
            maxWidth:   "100%",
          }}>
            {displayName}
          </span>
        )}
 
        {/* Switch college */}
        <button
          className="sidebar-item"
          onClick={() => router.push("/college")}
          style={{
            fontSize:  "0.7rem",
            padding:   "0.2rem 0.55rem",
            color:     "var(--text-muted)",
            gap:       "0.3rem",
            marginTop: "0.1rem",
          }}
          aria-label="Switch college"
        >
          <IconSwitch /> Switch
        </button>
      </div>
 
      {/* ── Nav links ── */}
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