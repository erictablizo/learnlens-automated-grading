"use client";
/**
 * NEW 2026-10-01 — Edit Profile.
 *
 * Save as, beside the exams folder:
 *     frontend/src/app/(dashboard)/profile/page.tsx     ->  /profile
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Navbar, { PROFILE_UPDATED_EVENT } from "@/components/ui/Navbar";
import { profileService } from "@/services/profileService";
import {
  College, UserProfile,
  YearLevel,
} from "@/types/profile";
import { useReferenceLists } from "@/hooks/useReferenceLists";
import { getToken, isAuthenticated } from "@/lib/auth";
// NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3. The shared handler;
// lib/formNav.ts named this screen as a caller when it was written.
import { advanceOnEnter, makeFieldCheck } from "@/lib/formNav";
import { checkPersonName, checkPosition, tidyName }
  from "@/lib/personName";
import { avatarUrl } from "@/lib/profileDisplay";

export default function EditProfilePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  /* NEW 2026-11-24 — requirement 3. The card Enter walks inside. The
     avatar's file input is display:none and formNav skips it, and the
     ".form-input" selector below skips it a second time, on purpose. */
  const cardRef = useRef<HTMLDivElement>(null);
  const loaded  = useRef(false);

  const [mounted,   setMounted]   = useState(false);
  const [profile,   setProfile]   = useState<UserProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [college,   setCollege]   = useState<College | "">("");
  const lists = useReferenceLists();
  const [course,    setCourse]    = useState("");
  const [position,  setPosition]  = useState("");
  const [year,      setYear]      = useState<YearLevel | "">("");

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  /* NEW 2026-11-24 — Ms. Melanie, page 18 requirement 3, FIFTH revision:
   *
   *   "Apply validation if you click enter in the first box and it's blank,
   *    and contains special characters, that when the validaition appears,
   *    once first box has been entered with info then it will proceed to
   *    second box, apply it as well in the succeeding input box"
   *
   * THE SAME SIX RULES handleSave() applies, in its order, against the one
   * `error` slot this screen has. Not a second, weaker copy: an Enter key
   * and a Save button that disagree about what is valid is worse than a
   * screen that only checks on Save.
   *
   * KEYED BY id, which every box on this card has — unlike app/setup, whose
   * boxes have none and are keyed by aria-label.
   *
   * The two dropdowns that depend on College are DISABLED until one is
   * chosen, and lib/formNav.ts skips disabled controls, so Enter cannot
   * strand the cursor on a Course box with nothing in it. */
  const fieldCheck = useMemo(() => makeFieldCheck({
    "first-name": { check: v => checkPersonName(v, "First name", true), show: setError },
    "last-name":  { check: v => checkPersonName(v, "Last name",  true), show: setError },
    "college":    { check: v => (v ? null : "Please select your college."), show: setError },
    "course":     { check: v => (v ? null : "Please select your course / program."), show: setError },
    "year-level": { check: v => (v ? null : "Please select a year level."), show: setError },
    "position":   { check: v => checkPosition(v, true), show: setError },
  }), []);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) { router.replace("/login"); return; }
    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    profileService.get(token)
      .then(p => {
        setProfile(p);
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
        setCollege((p.college as College) ?? "");
        setCourse(p.course ?? "");
        setPosition(p.position ?? "");
        setYear((p.year_level as YearLevel) ?? "");
        loaded.current = true;
      })
      .catch(() => setLoadError("Could not load your profile."))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!loaded.current) return;
    setCourse(c => (lists.loading ? c
    : (college && lists.coursesFor(college).includes(c) ? c : "")));
    setYear(y => (lists.loading ? y
    : (lists.isValidYear(college || null, y) ? y : "")));
  }, [college]);

  const courseOptions = (() => {
    if (!college) return [];
    const list = lists.coursesFor(college);
    const savedCourse = profile?.course ?? "";
    return savedCourse && profile?.college === college && !list.includes(savedCourse)
      ? [savedCourse, ...list]
      : list;
  })();

  const initials = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?";
  const currentAvatar = avatarPreview ?? avatarUrl(profile?.avatar_path, profile?.updated_at);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That photo is larger than 5 MB. Please choose a smaller one.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError(null);
    setSaved(false);
  };

  const undoAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setError(null);
  };

  const handleSave = async () => {
    setError(null); setSaved(false);
    const fieldError =
         checkPersonName(firstName, "First name", true)
      ?? checkPersonName(lastName,  "Last name",  true)
      ?? (!college ? "Please select your college." : null)
      ?? (!course  ? "Please select your course / program." : null)
      ?? (!year ? "Please select a year level." : null)
      ?? checkPosition(position, true);
    if (fieldError) { setError(fieldError); return; }

    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    setSaving(true);
    try {
      let uploaded: UserProfile | null = null;
      if (avatarFile) uploaded = await profileService.uploadAvatar(avatarFile, token);

      const updated = await profileService.save({
        first_name: tidyName(firstName),
        last_name:  tidyName(lastName),
        college:    college as College,
        course,
        position:   tidyName(position) || undefined,
        year_level: year === "" ? undefined : year,
      }, token);

      const newest = [updated.updated_at, uploaded?.updated_at]
        .filter(Boolean)
        .sort((a, b) => Date.parse(b as string) - Date.parse(a as string))[0]
        ?? updated.updated_at;

      setProfile({
        ...updated,
        avatar_path: uploaded?.avatar_path ?? updated.avatar_path,
        updated_at:  newest,
      });
      setAvatarFile(null);
      setAvatarPreview(null);
      setSaved(true);
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const labelGap = { marginBottom: "0.35rem" } as const;

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content" aria-label="Edit Profile">
        <h1 className="page-title">Edit Profile</h1>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            <span className="spinner spinner-dark" aria-hidden="true" />
            Loading your profile…
          </div>
        )}

        {!loading && loadError && (
          <>
            <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>
            <button type="button" className="btn-secondary" onClick={() => router.push("/exams")}>
              ← Back to Exams
            </button>
          </>
        )}

        {!loading && !loadError && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              className="create-exam-form"
              ref={cardRef}
              /* NEW 2026-11-24 — requirement 3: "press enter key, it will go to the
                 1st Column of the second box."  On the LAST box (Position)
                 advanceOnEnter returns false and nothing happens, deliberately —
                 the same decision as app/setup/page.tsx, this screen's sibling.

                 FIFTH REVISION, same day: the box is CHECKED before anything
                 moves. See fieldCheck above. */
              onKeyDown={e => { advanceOnEnter(e, cardRef.current, ".form-input", fieldCheck); }}
            >

              {/* ── Photo ── */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Change profile photo"
                  title="Click to change your photo"
                  disabled={saving}
                  style={{
                    width: 84, height: 84, borderRadius: "50%", flexShrink: 0, padding: 0,
                    overflow: "hidden", cursor: saving ? "not-allowed" : "pointer",
                    border: avatarFile ? "2.5px solid var(--orange)" : "2px solid var(--border)",
                    background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {currentAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentAvatar} alt="Profile photo"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "1.7rem", fontWeight: 700, color: "var(--text-muted)",
                      fontFamily: "var(--font-heading)" }}>{initials}</span>
                  )}
                </button>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button type="button" className="btn-secondary" disabled={saving}
                      onClick={() => fileRef.current?.click()}
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}>
                      {currentAvatar ? "Change photo" : "Upload photo"}
                    </button>
                    {avatarFile && (
                      <button type="button" className="btn-secondary" disabled={saving} onClick={undoAvatar}
                        style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}>
                        Undo
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    {avatarFile
                      ? `${avatarFile.name.slice(0, 28)}${avatarFile.name.length > 28 ? "…" : ""} — saved when you press Save`
                      : "JPEG, PNG or WebP, up to 5 MB."}
                  </span>
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }} onChange={handleAvatarChange} disabled={saving} />
              </div>

              {/* ── Name ── */}
              <label className="form-label" htmlFor="first-name" style={labelGap}>
                First Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
              </label>
              <input
                /* NEW 2026-11-24 — requirement 3: "automatic the cursor will position
                   on the 1st Column of the First Input Box." */
                autoFocus
                id="first-name" className="form-input" value={firstName} disabled={saving}
                onChange={e => { setFirstName(e.target.value); setError(null); setSaved(false); }}
                aria-required="true" autoComplete="given-name" />

              <label className="form-label" htmlFor="last-name" style={labelGap}>
                Last Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
              </label>
              <input id="last-name" className="form-input" value={lastName} disabled={saving}
                onChange={e => { setLastName(e.target.value); setError(null); setSaved(false); }}
                aria-required="true" autoComplete="family-name" />

              {/* ── College / course ── */}
              <label className="form-label" htmlFor="college" style={labelGap}>
                College <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
              </label>
              <select id="college" className="form-input" value={college} disabled={saving}
                onChange={e => { setCollege(e.target.value as College | ""); setError(null); setSaved(false); }}
                aria-required="true">
                <option value="">Select your college…</option>
                {lists.collegeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <label className="form-label" htmlFor="course" style={labelGap}>
                Course / Program <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
              </label>
              <select id="course" className="form-input" value={course} disabled={saving || !college}
                onChange={e => { setCourse(e.target.value); setError(null); setSaved(false); }}
                aria-required="true">
                <option value="">{college ? "Select your course…" : "Select a college first"}</option>
                {courseOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <label className="form-label" htmlFor="year-level" style={labelGap}>
                Year Level <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
              </label>
              <select id="year-level" className="form-input" value={year === "" ? "" : String(year)}
                disabled={saving || !college}
                onChange={e => {
                  const v = e.target.value;
                  setYear(v === "" ? "" : (Number(v) as YearLevel));
                  setError(null); setSaved(false);
                }}
                aria-required="true">
                <option value="">{college ? "Select your year level…" : "Select a college first"}</option>
                {lists.yearLevelsFor(college || null).map(y => (
                  <option key={y} value={y}>{lists.yearLabel(college || null, y)}</option>
                ))}
              </select>
              <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "-0.7rem", marginBottom: "1rem" }}>
                The year level you usually teach. Saved to your profile.
              </p>

              <label className="form-label" htmlFor="position" style={labelGap}>
                Position <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
              </label>
              <input id="position" className="form-input" value={position} disabled={saving}
                placeholder="e.g. Instructor II"
                aria-required="true"
                onChange={e => { setPosition(e.target.value); setError(null); setSaved(false); }} />
              <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "-0.7rem", marginBottom: "1rem" }}>
                Shown in the sidebar under your name, above your course.
              </p>

              {error && (
                <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
                  {error}
                </div>
              )}
              {saved && !error && (
                <div role="status" aria-live="polite" className="alert alert-success" style={{ marginBottom: "1rem" }}>
                  Profile saved.
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}
                  aria-busy={saving} style={{ width: "auto", padding: "0.65rem 1.75rem" }}>
                  {saving ? <><span className="spinner" aria-hidden="true" /> Saving…</> : "Save"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => router.push("/exams")} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}