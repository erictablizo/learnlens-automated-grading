"use client";
/**
 * ENHANCEMENT 2026-10-01 — the profile block is now a link to /profile.
 *
 * CHANGED 2026-10-04 — the /college screens are gone, so the "Switch" button
 * is gone with them. The college badge now comes straight from the saved
 * profile; it is changed on the Edit Profile page like every other profile
 * field.
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
 *
 * CHANGED 2026-10-22 — Doc Rubrica, second comment: the course belongs UNDER
 * the name. The block used to render ONE string from buildDisplayName(),
 *
 *     "Eric Bernard R Tablizo, Bachelor of Science in Computer Science Professor"
 *
 * which this narrow column wrapped wherever it ran out of room, putting a
 * comma at the end of the name and breaking the course mid-phrase. It now
 * renders the three lines profileLines() returns as three separate elements,
 * so the course can never run on from the name.
 *
 * CHANGED 2026-11-04 — Doc Rubrica, consultation, page 4: "Add Additional TAB
 * for Summary Report". Her sketch gives the order explicitly:
 *
 *     Profile Info / [Edit] / Manage Exam / Summary Report / Sign out
 *
 * so the new entry sits BETWEEN Manage Exams and Sign out, not after it.
 *
 * CHANGED 2026-11-11 — Doc Rubrica, post-UAT recommendations, page 1, first
 * line: "Data Analytics - separate clickable option in the side bar".
 *
 * It goes AFTER Summary Report and still before Sign out, which stays last.
 * The two report-shaped screens sit together, and the order her 2026-11-04
 * sketch fixed is untouched.
 *
 * CHANGED 2026-11-12 — Doc Rubrica's "Create List of Students per Section",
 * and Alex Passion / Julius Bancud page 2 item 4, "ID Student # -> file of
 * Test Exam / Primary Key -> Additional Table".
 *
 * Students goes BETWEEN Manage Exams and Summary Report, and the placement is
 * the argument: it is a SETUP screen, not a report. The 2026-11-11 note above
 * fixed that "the two report-shaped screens sit together", so dropping a
 * roster between them would break the grouping that note established. Manage
 * Exams stays first, as her 2026-11-04 sketch fixed, and Sign out stays last.
 *
 *     Manage Exams / Students / Summary Report / Data Analytics / Sign out
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearAuth, getToken } from "@/lib/auth";
import { clearActiveCollege, COLLEGE_COLORS } from "@/lib/college";
import { College, UserProfile } from "@/types/profile";
import { profileService } from "@/services/profileService";
// NEW 2026-10-01: shared with the Edit Profile page and the college picker
// CHANGED 2026-10-22: profileLines replaces buildDisplayName here. The export
// itself is KEPT in lib/profileDisplay.ts because the college picker uses it.
import { avatarUrl, initialsOf, profileLines } from "@/lib/profileDisplay";

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
// NEW 2026-10-01
const IconPencil = () => (
  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
// NEW 2026-11-04 — bars inside a sheet, so it reads as a report at 16px rather
// than as another list beside IconList.
const IconReport = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 17v-5m3 5v-8m3 8v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);
// NEW 2026-11-11 — a PIE, deliberately not a third set of bars.
//
// IconList is horizontal bars and IconReport is vertical bars in a sheet.
// At 16px, in a column, a third bar-shaped glyph beneath them is a blur - the
// same reasoning that gave Summary Report its own icon on 2026-11-04 rather
// than reusing IconList. A wedge cut out of a circle is unmistakable even
// when it is tiny and greyed out.
const IconChart = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 3a9 9 0 109 9h-9V3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 3.5A9 9 0 0120.5 9.5H14.5V3.5z" />
  </svg>
);

// NEW 2026-11-12 — two people, deliberately not a fourth bar-or-circle glyph.
//
// IconList is horizontal bars, IconReport is vertical bars in a sheet,
// IconChart is a pie. The 2026-11-11 note above records why a third
// bar-shaped glyph would blur at 16px in a column; a fourth abstract shape
// would be worse. A head-and-shoulders pair reads as "people" instantly and
// shares no silhouette with the other three.
const IconStudents = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();

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
    setImgError(false);
    loadProfile();
  }, [pathname, loadProfile]);

  // NEW 2026-10-01: refresh as soon as Edit Profile saves, without navigating
  useEffect(() => {
    const onUpdated = () => { loadProfile(); };
    window.addEventListener(PROFILE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onUpdated);
  }, [loadProfile]);

  const handleSignOut = () => {
    clearAuth();
    clearActiveCollege();
    router.replace("/login");
  };

  // CHANGED 2026-10-04: the badge is the profile's college, full stop.
  const college     = (profile?.college as College | null) ?? null;
  const col         = college ? COLLEGE_COLORS[college] : null;
  // CHANGED 2026-10-22: three lines instead of one string. Still only drawn
  // when `profile` has arrived, so nothing flashes while it loads.
  const lines       = profileLines(profile);
  const avatarSrc   = profile ? avatarUrl(profile.avatar_path, profile.updated_at) : null;
  const onProfile   = pathname.startsWith("/profile");
  // NEW 2026-11-04. Separate consts rather than repeating the test in the
  // className and the aria-current, which is how the two drift apart.
  const onExams     = pathname.startsWith("/exams");
  const onReports   = pathname.startsWith("/reports");
  // NEW 2026-11-11. Same pattern, same reason: one const read by both the
  // className and the aria-current, so the highlight and the announced state
  // cannot disagree.
  //
  // "/analytics" shares no prefix with "/exams" or "/reports", so exactly one
  // tab lights up on each screen. If this route is ever moved under
  // /reports/analytics, the onReports test above starts matching it too and
  // both would highlight - tighten it then.
  const onAnalytics = pathname.startsWith("/analytics");
  // NEW 2026-11-12. Same one-const pattern as the three above.
  //
  // "/students" shares no prefix with "/exams", "/reports" or "/analytics", so
  // exactly one tab lights up on each screen. The one to watch is a future
  // /exams/[id]/students - that WOULD light both this and Manage Exams, and
  // the roster is deliberately a top-level screen rather than a tab inside an
  // exam, because a class list outlives any single exam.
  const onStudents  = pathname.startsWith("/students");

  // Initials fallback
  const initials = profile ? initialsOf(profile) : col?.initials ?? "?";

  // CHANGED 2026-10-22: shared by the three profile lines, so they stay a set.
  const lineBase = {
    display:      "block",
    textAlign:    "center" as const,
    maxWidth:     "100%",
    overflowWrap: "anywhere" as const,
  };

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

          {/* CHANGED 2026-10-22 (Doc Rubrica): three lines, not one string, so
              the course cannot run on from the name however narrow the
              sidebar gets.

              ORDER FIXED 2026-10-23 (Doc Rubrica, by diagram):

                  Name of the Teacher
                  Position
                  Bachelor of Science in What

              i.e. NAME, then POSITION, then COURSE. It used to be name,
              course, position. The order is the requirement here - do not
              reorder these three without checking with her, and if you do,
              fix the Position help text on the Edit Profile page, which
              describes where this lands. */}
          {profile && (
            <span style={{ ...lineBase, marginTop: "0.1rem" }}>
              {/* 1. Name */}
              {lines.name && (
                <span style={{
                  ...lineBase,
                  fontSize:   "0.72rem",
                  fontWeight: 600,
                  color:      "var(--navy)",
                  lineHeight: 1.35,
                }}>
                  {lines.name}
                </span>
              )}

              {/* 2. Position - always drawn; falls back to "Teacher". */}
              <span style={{
                ...lineBase,
                fontSize:   "0.68rem",
                color:      "var(--text-muted)",
                lineHeight: 1.4,
                marginTop:  "0.12rem",
              }}>
                {lines.position}
              </span>

              {/* 3. Course - omitted entirely when none is saved, rather than
                  leaving an empty line between Position and the Edit link. */}
              {lines.course && (
                <span style={{
                  ...lineBase,
                  fontSize:   "0.68rem",
                  color:      "var(--text-muted)",
                  lineHeight: 1.4,
                  marginTop:  "0.12rem",
                }}>
                  {lines.course}
                </span>
              )}
            </span>
          )}
        </Link>

        {/* Edit profile — "Switch" was removed on 2026-10-04 with the
            /college screens; the college is changed on Edit Profile now. */}
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
      </div>

      {/* ── Nav links ── */}
      <Link
        href="/exams"
        className={`sidebar-item${onExams ? " active" : ""}`}
        aria-current={onExams ? "page" : undefined}
      >
        <IconList />
        Manage Exams
      </Link>

      {/* NEW 2026-11-12 (Doc Rubrica): "Create List of Students per Section".

          A SETUP screen, so it sits with Manage Exams rather than with the two
          report screens below. The student number entered here is what links a
          test paper to a student - the prerequisite for batch upload, Alex &
          Bancud page 2 item 7. */}
      <Link
        href="/students"
        className={`sidebar-item${onStudents ? " active" : ""}`}
        aria-current={onStudents ? "page" : undefined}
      >
        <IconStudents />
        Students
      </Link>

      {/* NEW 2026-11-04 (Doc Rubrica, page 4): "Add Additional TAB for Summary
          Report". Between Manage Exams and Sign out, which is where her
          "after" sketch puts it.

          /reports does not collide with the /exams test above, so Manage Exams
          does not light up on this screen. */}
      <Link
        href="/reports"
        className={`sidebar-item${onReports ? " active" : ""}`}
        aria-current={onReports ? "page" : undefined}
      >
        <IconReport />
        Summary Report
      </Link>

      {/* NEW 2026-11-11 (Doc Rubrica, post-UAT page 1): "Data Analytics -
          separate clickable option in the side bar".

          It reads the same three Subject / Schedule / Exam Name boxes the
          Summary Report does, so it belongs beside it rather than under
          Manage Exams. Sign out stays last. */}
      <Link
        href="/analytics"
        className={`sidebar-item${onAnalytics ? " active" : ""}`}
        aria-current={onAnalytics ? "page" : undefined}
      >
        <IconChart />
        Data Analytics
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