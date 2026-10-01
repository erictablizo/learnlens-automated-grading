"use client";
/**
 * ENHANCEMENT 2026-10-01 — the profile block is now a link to /profile.
 *
 *  - Clicking the photo / badge / name opens Edit Profile, and a small
 *    "Edit" button sits next to "Switch" for a visible affordance.
 *  - The avatar URL carries ?v=<updated_at>. The backend always saves the
 *    photo as user_<id>.jpg, so without this the browser keeps showing the
 *    OLD photo from cache after a change. Needs `updated_at` on the profile
 *    response (backend/app/schemas/profile.py) and in types/profile.ts.
 *  - The sidebar refreshes on the "learnlens:profile-updated" window event,
 *    which the Edit Profile page fires after saving, so the new name and
 *    photo appear straight away instead of only after navigating.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearAuth, getToken } from "@/lib/auth";
import { clearActiveCollege, getActiveCollege, COLLEGE_COLORS } from "@/lib/college";
import { College, UserProfile } from "@/types/profile";
import { profileService } from "@/services/profileService";
// NEW 2026-10-01: shared with the Edit Profile page and the college picker
import { avatarUrl, buildDisplayName, initialsOf } from "@/lib/profileDisplay";
 
/** Fired by the Edit Profile page after a successful save. */
export const PROFILE_UPDATED_EVENT = "learnlens:profile-updated";
 
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
// NEW 2026-10-01
const IconPencil = () => (
  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
 
export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
 
  const [college,     setCollege]     = useState<College | null>(null);
  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [imgError,    setImgError]    = useState(false);

  const loadProfile = useCallback(() => {
    const token = getToken();
    if (!token) return;
    profileService.get(token)
      .then(p => { setProfile(p); setImgError(false); })
      .catch(() => {});
  }, []);
 
  useEffect(() => {
    setCollege(getActiveCollege());
    setImgError(false);
    loadProfile();
  }, [pathname, loadProfile]);

  // NEW 2026-10-01: refresh as soon as Edit Profile saves, without navigating
  useEffect(() => {
    const onUpdated = () => { setCollege(getActiveCollege()); loadProfile(); };
    window.addEventListener(PROFILE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onUpdated);
  }, [loadProfile]);
 
  const handleSignOut = () => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  };
 
  const col         = college ? COLLEGE_COLORS[college] : null;
  const displayName = profile ? buildDisplayName(profile) : null;
  const avatarSrc   = profile ? avatarUrl(profile.avatar_path, profile.updated_at) : null;
  const onProfile   = pathname.startsWith("/profile");
 
  // Initials fallback
  const initials = profile ? initialsOf(profile) : col?.initials ?? "?";
 
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
        {/* NEW 2026-10-01: photo + badge + name open Edit Profile */}
        <Link
          href="/profile"
          title="Edit profile"
          aria-label="Edit profile"
          aria-current={onProfile ? "page" : undefined}
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            "0.4rem",
            width:          "100%",
            textDecoration: "none",
            color:          "inherit",
            borderRadius:   "10px",
            padding:        "0.2rem 0.1rem 0.3rem",
            background:     onProfile ? "var(--orange-light)" : "transparent",
          }}
        >
          {/* Avatar — photo if available, initials circle otherwise */}
          <div
            style={{
              width:        52,
              height:       52,
              borderRadius: "50%",
              overflow:     "hidden",
              border:       onProfile ? "2px solid var(--orange)" : "2px solid var(--border)",
              flexShrink:   0,
              background:   col?.bg ?? "var(--bg)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              position:     "relative",
            }}
            aria-hidden="true"
          >
            {avatarSrc && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
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
        </Link>
 
        {/* Edit profile + Switch college */}
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", justifyContent: "center" }}>
          {/* NEW 2026-10-01 */}
          <Link
            href="/profile"
            className={`sidebar-item${onProfile ? " active" : ""}`}
            style={{
              fontSize:  "0.7rem",
              padding:   "0.2rem 0.55rem",
              color:     onProfile ? undefined : "var(--text-muted)",
              gap:       "0.3rem",
              marginTop: "0.1rem",
              width:     "auto",
            }}
            aria-label="Edit profile"
          >
            <IconPencil /> Edit
          </Link>

          <button
            className="sidebar-item"
            onClick={() => router.push("/college")}
            style={{
              fontSize:  "0.7rem",
              padding:   "0.2rem 0.55rem",
              color:     "var(--text-muted)",
              gap:       "0.3rem",
              marginTop: "0.1rem",
              width:     "auto",
            }}
            aria-label="Switch college"
          >
            <IconSwitch /> Switch
          </button>
        </div>
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