"use client";
/**
 * CHANGED 2026-10-05:
 *  - Continue / Skip now go to /exams. The /college screens were removed, so
 *    sending a new teacher there was a 404.
 *  - "STEP 1 OF 2" is now just "PROFILE" with one dot — there is no step 2.
 *  - Year Level added. It saves to user_profiles.year_level (migration
 *    2026-10-04_year_level.sql) and is the teacher's default year, editable
 *    later on the Edit Profile page.
 */
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { profileService } from "@/services/profileService";
import {
  COLLEGE_OPTIONS, COURSES_BY_COLLEGE, College,
  YearLevel, YEAR_LABELS, yearLevelsFor,          // Added on 2026-10-05
} from "@/types/profile";
import { getToken, isAuthenticated } from "@/lib/auth";
import { checkPersonName, checkPosition, looksMiscased, tidyName }
  from "@/lib/personName";

export default function ProfileSetupPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [college,       setCollege]       = useState<College | "">("");
  const [course,        setCourse]        = useState("");
  const [year,          setYear]          = useState<YearLevel | "">("");   // Added 2026-10-05
  const [position,      setPosition]      = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  // Reset course and year when college changes (a CAST course and a 6th year
  // make no sense once the college is something else)
  useEffect(() => { setCourse(""); setYear(""); }, [college]);

  const courseOptions = college ? COURSES_BY_COLLEGE[college] : [];
  const yearOptions   = yearLevelsFor(college || null);          // Added 2026-10-05

  // Live initials from typed name
  const initials = [firstName[0], lastName[0]]
    .filter(Boolean).join("").toUpperCase() || "?";

  // FIX 2026-10-22: a HINT, never an error. LearnLens keeps the case the
  // teacher types, because auto-capitalising turns "de la Cruz" into
  // "De La Cruz" and "O'Brien" into "O'brien". See lib/personName.ts.
  const caseHint = looksMiscased(`${firstName} ${lastName}`);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, or WebP).");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    // Client-side validation before any API call (HCI: error prevention)
    if (!firstName.trim()) { setError("First name is required."); return; }
    if (!lastName.trim())  { setError("Last name is required.");  return; }
    if (!college)          { setError("Please select your college."); return; }
    if (!course)           { setError("Please select your course / program."); return; }
    // FIX 2026-10-22 (Doc Rubrica): UPPERCASE, lowercase and special
    // characters. Same rules, same order and same words as
    // _check_person_name() / _check_position() in schemas/profile.py.
    const charError = checkPersonName(firstName, "First name")
                   ?? checkPersonName(lastName, "Last name")
                   ?? checkPosition(position);
    if (charError) { setError(charError); return; }
    // Year level is optional — it is a default, not part of a complete profile.

    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    setSaving(true);
    try {
      // Upload avatar first (if provided) so it's stored before profile save
      if (avatarFile) {
        await profileService.uploadAvatar(avatarFile, token);
      }
      await profileService.save({
        // FIX 2026-10-22: tidyName, not trim - the server collapses runs of
        // whitespace, so send what it would have stored anyway.
        first_name: tidyName(firstName),
        last_name:  tidyName(lastName),
        college:    college as College,
        course,
        position:   tidyName(position) || undefined,
        year_level: year === "" ? undefined : year,     // Added 2026-10-05
      }, token);
      // CHANGED 2026-10-05: straight to Manage Exams — /college no longer exists
      router.replace("/exams");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save profile. Please try again.");
    } finally { setSaving(false); }
  };

  const handleSkip = () => router.replace("/exams");   // CHANGED 2026-10-05

  const selectStyle = (filled: boolean) => ({
    width:        "100%",
    border:       "none",
    borderBottom: "1.5px solid var(--border)",
    background:   "transparent",
    padding:      "0.7rem 0.2rem",
    fontSize:     "0.95rem",
    color:        filled ? "var(--text)" : "var(--text-muted)",
    outline:      "none",
    marginBottom: "1rem",
  } as const);

  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ maxWidth: 440 }}>

        {/* Progress dot — CHANGED 2026-10-05: setup is the only step now */}
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: "1rem" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--orange)" }} />
        </div>

        <p style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>
          PROFILE
        </p>
        <h1 className="auth-title" style={{ marginBottom: "0.3rem" }}>Set up your profile</h1>
        <p className="auth-subtitle">
          This helps LearnLens personalise your experience.<br />You only need to do this once.
        </p>

        {error && (
          <div role="alert" aria-live="assertive" className="alert alert-error">
            {error}
          </div>
        )}

        {/* ── Avatar upload ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Upload profile photo"
            title="Click to upload a profile photo"
            style={{
              width:        80,
              height:       80,
              borderRadius: "50%",
              border:       avatarPreview
                ? "2.5px solid var(--orange)"
                : "2px dashed var(--border)",
              background:   avatarPreview ? "transparent" : "var(--bg)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              cursor:       "pointer",
              overflow:     "hidden",
              padding:      0,
              position:     "relative",
              transition:   "border-color .2s",
            }}
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreview}
                alt="Avatar preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{
                fontSize:   "1.6rem",
                fontWeight: 700,
                color:      initials === "?" ? "var(--text-muted)" : "var(--navy)",
                fontFamily: "var(--font-heading)",
                userSelect: "none",
              }}>
                {initials}
              </span>
            )}

            {/* Camera overlay hint */}
            {!avatarPreview && (
              <span style={{
                position:   "absolute",
                bottom:     4,
                right:      4,
                width:      20,
                height:     20,
                borderRadius: "50%",
                background: "var(--orange)",
                display:    "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize:   11,
              }}>
                📷
              </span>
            )}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
            aria-hidden="true"
          />

          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {avatarPreview ? "✓ Photo selected" : "Profile photo (optional)"}
          </span>

          {avatarPreview && (
            <button
              type="button"
              onClick={() => { setAvatarPreview(null); setAvatarFile(null); }}
              style={{
                fontSize:   "0.72rem",
                color:      "var(--error)",
                background: "none",
                border:     "none",
                cursor:     "pointer",
                textDecoration: "underline",
              }}
            >
              Remove photo
            </button>
          )}
        </div>

        {/* ── Name row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              aria-label="First name"
              aria-required="true"
              disabled={saving}
            />
          </div>
          <div className="field">
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              aria-label="Last name"
              aria-required="true"
              disabled={saving}
            />
          </div>
        </div>

        {/* ── College dropdown ── */}
        <div className="field">
          <select
            value={college}
            onChange={e => setCollege(e.target.value as College)}
            aria-label="College"
            aria-required="true"
            style={selectStyle(!!college)}
            disabled={saving}
          >
            <option value="" disabled>Select your college</option>
            {COLLEGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* ── Course — filtered by selected college ── */}
        {college && (
          <div className="field">
            <select
              value={course}
              onChange={e => setCourse(e.target.value)}
              aria-label="Course or program"
              aria-required="true"
              style={selectStyle(!!course)}
              disabled={saving}
            >
              <option value="" disabled>Select your course / program</option>
              {courseOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Year level — Added 2026-10-05, optional, filtered by college ── */}
        {college && (
          <div className="field">
            <select
              value={year === "" ? "" : String(year)}
              onChange={e => {
                const v = e.target.value;
                setYear(v === "" ? "" : (Number(v) as YearLevel));
              }}
              aria-label="Year level you usually teach"
              style={selectStyle(year !== "")}
              disabled={saving}
            >
              <option value="">Year level you usually teach (optional)</option>
              {yearOptions.map(y => (
                <option key={y} value={y}>{YEAR_LABELS[y]}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Position ── */}
        <div className="field">
          <input
            type="text"
            placeholder="Position / Title (e.g. Instructor II, Professor)"
            value={position}
            onChange={e => setPosition(e.target.value)}
            aria-label="Position or title"
            disabled={saving}
          />
        </div>

        {/* Preview of sidebar display name */}
        {firstName && lastName && course && (
          <div style={{
            background:   "var(--bg)",
            borderRadius: "var(--radius-sm)",
            padding:      "0.6rem 0.9rem",
            fontSize:     "0.78rem",
            color:        "var(--text-muted)",
            marginBottom: "1rem",
            display:      "flex",
            alignItems:   "center",
            gap:          "0.5rem",
          }}>
            <span style={{ fontSize: "1rem" }}>👁</span>
            <span>
              Sidebar will show:{" "}
              <strong style={{ color: "var(--navy)" }}>
                {tidyName(firstName)} {tidyName(lastName)}, {course} {tidyName(position) || "Teacher"}
              </strong>
              {caseHint && (
                <>
                  <br />
                  <span style={{ color: "var(--text-muted)" }}>{caseHint}</span>
                </>
              )}
            </span>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving
            ? <><span className="spinner" aria-hidden="true" /> Saving…</>
            : "Continue →"}
        </button>

        <button
          type="button"
          onClick={handleSkip}
          style={{
            display:        "block",
            width:          "100%",
            background:     "none",
            border:         "none",
            cursor:         "pointer",
            textAlign:      "center",
            fontSize:       "0.82rem",
            color:          "var(--text-muted)",
            marginTop:      "0.75rem",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}