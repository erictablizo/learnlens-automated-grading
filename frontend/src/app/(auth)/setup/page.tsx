"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { profileService } from "@/services/profileService";
import { COLLEGE_OPTIONS, College } from "@/types/profile";
import { getToken, isAuthenticated } from "@/lib/auth";
 
export default function ProfileSetupPage() {
  const router   = useRouter();
  const fileRef  = useRef<HTMLInputElement>(null);
 
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [college,       setCollege]       = useState<College | "">("");
  const [department,    setDepartment]    = useState("");
  const [position,      setPosition]      = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [mounted,       setMounted]       = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);
 
  if (!mounted) return null;
 
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };
 
  const handleSave = async () => {
    setError(null);
    if (!firstName.trim()) { setError("First name is required.");      return; }
    if (!lastName.trim())  { setError("Last name is required.");       return; }
    if (!college)          { setError("Please select your college.");  return; }
 
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
 
    setSaving(true);
    try {
      if (avatarFile) await profileService.uploadAvatar(avatarFile, token);
      await profileService.save({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        college,
        department: department.trim() || undefined,
        position:   position.trim()   || undefined,
      }, token);
      // After setup → college picker
      router.replace("/college");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save profile. Please try again.");
    } finally { setSaving(false); }
  };
 
  const handleSkip = () => router.replace("/college");
 
  const initials = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?";
 
  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ maxWidth: 440 }}>
 
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: "1rem" }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 7, height: 7, borderRadius: "50%",
              background: i === 0 ? "var(--orange)" : "var(--border)",
            }} />
          ))}
        </div>
 
        <p style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>
          STEP 1 OF 3 — PROFILE
        </p>
        <h1 className="auth-title" style={{ marginBottom: "0.3rem" }}>Set up your profile</h1>
        <p className="auth-subtitle">
          This helps LearnLens personalise your experience.<br />You only need to do this once.
        </p>
 
        {error && (
          <div role="alert" aria-live="assertive" className="alert alert-error">{error}</div>
        )}
 
        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Upload profile photo"
            style={{
              width: 72, height: 72, borderRadius: "50%",
              border: avatarPreview ? "2px solid var(--orange)" : "2px dashed var(--border)",
              background: avatarPreview ? "transparent" : "var(--bg)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", overflow: "hidden", padding: 0,
            }}
          >
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: "1.5rem", color: "var(--text-muted)", fontWeight: 600 }}>{initials}</span>
            }
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }} onChange={handleAvatarChange} aria-hidden="true" />
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Profile photo <span style={{ opacity: 0.6 }}>(optional)</span>
          </span>
        </div>
 
        {/* Name row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <input type="text" placeholder="First name"
              value={firstName} onChange={e => setFirstName(e.target.value)}
              aria-label="First name" aria-required="true" disabled={saving} />
          </div>
          <div className="field">
            <input type="text" placeholder="Last name"
              value={lastName} onChange={e => setLastName(e.target.value)}
              aria-label="Last name" aria-required="true" disabled={saving} />
          </div>
        </div>
 
        {/* College */}
        <div className="field">
          <select
            className="dropdown"
            value={college}
            onChange={e => setCollege(e.target.value as College)}
            aria-label="College" aria-required="true"
            style={{ width: "100%", marginBottom: 0 }}
            disabled={saving}
          >
            <option value="" disabled>Select your college</option>
            {COLLEGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
 
        {/* Department */}
        <div className="field">
          <input type="text" placeholder="Department / Program (optional)"
            value={department} onChange={e => setDepartment(e.target.value)}
            aria-label="Department or program" disabled={saving} />
        </div>
 
        {/* Position */}
        <div className="field">
          <input type="text" placeholder="Position / Title (optional)"
            value={position} onChange={e => setPosition(e.target.value)}
            aria-label="Position or title" disabled={saving} />
        </div>
 
        <button className="btn-primary" onClick={handleSave} disabled={saving} aria-busy={saving}>
          {saving ? <><span className="spinner" aria-hidden="true" /> Saving…</> : "Continue →"}
        </button>
 
        <button
          type="button"
          onClick={handleSkip}
          style={{
            display: "block", width: "100%", background: "none", border: "none",
            cursor: "pointer", textAlign: "center", fontSize: "0.82rem",
            color: "var(--text-muted)", marginTop: "0.75rem",
            textDecoration: "underline", textUnderlineOffset: "2px",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}