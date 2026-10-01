"use client";
/**
 * NEW 2026-10-01 — Edit Profile.
 *
 * The profile could only ever be set once, during /setup. This page lets the
 * teacher change it afterwards: photo, name, college, course and position.
 * It reuses the endpoints that already exist, so the backend is unchanged
 * apart from `updated_at` being added to the profile response:
 *     GET  /api/profile          profileService.get
 *     PUT  /api/profile          profileService.save
 *     POST /api/profile/avatar   profileService.uploadAvatar
 *
 * Validation matches /setup — first name, last name, college and course are
 * all required, so saving here can never leave the profile incomplete.
 *
 * Lives at, beside the exams folder so it gets the same layout and sidebar:
 *     frontend/src/app/(dashboard)/profile/page.tsx     ->  /profile
 */
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { profileService } from "@/services/profileService";
import { COLLEGE_OPTIONS, COURSES_BY_COLLEGE, College, UserProfile } from "@/types/profile";
import { getToken, isAuthenticated } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");

/** Same as the sidebar: "uploads/avatars/user_1.jpg" → full URL.
 *  `v` busts the browser cache, because the file name never changes. */
function avatarUrl(path: string | null | undefined, v?: string | null): string | null {
  if (!path) return null;
  const url = `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
  return v ? `${url}?v=${encodeURIComponent(v)}` : url;
}

export default function EditProfilePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded  = useRef(false);     // so loading a profile does not wipe its course

  const [profile,   setProfile]   = useState<UserProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [college,   setCollege]   = useState<College | "">("");
  const [course,    setCourse]    = useState("");
  const [position,  setPosition]  = useState("");

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
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
        loaded.current = true;
      })
      .catch(() => setLoadError("Could not load your profile."))
      .finally(() => setLoading(false));
  }, [router]);

  // Clear the course when the college CHANGES — but not while loading the
  // saved profile, or the teacher's existing course would be wiped on arrival.
  useEffect(() => {
    if (!loaded.current) return;
    setCourse(c => (college && COURSES_BY_COLLEGE[college].includes(c) ? c : ""));
  }, [college]);

  // Keep a course that is not in the list (entered before the list changed)
  const courseOptions = (() => {
    if (!college) return [];
    const list = COURSES_BY_COLLEGE[college];
    const saved0 = profile?.course ?? "";
    return saved0 && profile?.college === college && !list.includes(saved0)
      ? [saved0, ...list]
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
    if (!firstName.trim()) { setError("First name is required."); return; }
    if (!lastName.trim())  { setError("Last name is required.");  return; }
    if (!college)          { setError("Please select your college."); return; }
    if (!course)           { setError("Please select your course / program."); return; }

    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    setSaving(true);
    try {
      // Upload the photo first (if changed) so the saved profile already has it
      if (avatarFile) await profileService.uploadAvatar(avatarFile, token);
      const updated = await profileService.save({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        college:    college as College,
        course,
        position:   position.trim() || undefined,
      }, token);
      setProfile(updated);
      setAvatarFile(null);
      setAvatarPreview(null);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem" }}>
        <span className="spinner spinner-dark" />
        <span style={{ color: "var(--text-muted)" }}>Loading your profile…</span>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ padding: "2rem" }}>
        <div className="alert alert-error" role="alert">{loadError}</div>
        <button type="button" className="btn-secondary" onClick={() => router.push("/exams")}>
          ← Back to Exams
        </button>
      </div>
    );
  }

  const label = { marginBottom: "0.35rem" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h1 className="page-title" style={{ marginBottom: "1.5rem" }}>Edit Profile</h1>

      <div className="create-exam-form">

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
        <label className="form-label" htmlFor="first-name" style={label}>
          First Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
        </label>
        <input id="first-name" className="form-input" value={firstName} disabled={saving}
          onChange={e => { setFirstName(e.target.value); setError(null); setSaved(false); }}
          aria-required="true" autoComplete="given-name" />

        <label className="form-label" htmlFor="last-name" style={label}>
          Last Name <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
        </label>
        <input id="last-name" className="form-input" value={lastName} disabled={saving}
          onChange={e => { setLastName(e.target.value); setError(null); setSaved(false); }}
          aria-required="true" autoComplete="family-name" />

        {/* ── College / course ── */}
        <label className="form-label" htmlFor="college" style={label}>
          College <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
        </label>
        <select id="college" className="form-input" value={college} disabled={saving}
          onChange={e => { setCollege(e.target.value as College | ""); setError(null); setSaved(false); }}
          aria-required="true">
          <option value="">Select your college…</option>
          {COLLEGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className="form-label" htmlFor="course" style={label}>
          Course / Program <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
        </label>
        <select id="course" className="form-input" value={course} disabled={saving || !college}
          onChange={e => { setCourse(e.target.value); setError(null); setSaved(false); }}
          aria-required="true">
          <option value="">{college ? "Select your course…" : "Select a college first"}</option>
          {courseOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="form-label" htmlFor="position" style={label}>Position</label>
        <input id="position" className="form-input" value={position} disabled={saving}
          placeholder="Teacher"
          onChange={e => { setPosition(e.target.value); setError(null); setSaved(false); }} />
        <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "-0.7rem", marginBottom: "1rem" }}>
          Shown in the sidebar after your course. Leave blank to use &ldquo;Teacher&rdquo;.
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
  );
}