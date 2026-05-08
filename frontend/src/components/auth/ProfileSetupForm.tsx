"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { isAuthenticated } from "@/lib/auth";
 
const COLLEGE_FULL_NAMES: Record<string, string> = {
  CVMAS: "College of Veterinary Medicine and Agricultural Sciences",
  CBMA:  "College of Business, Management, and Accountancy",
  CoEd:  "College of Education",
  CAST:  "College of Arts, Sciences and Technology",
};
 
export default function ProfileSetupForm() {
  const router = useRouter();
  const { colleges, isLoading, error, setError, fetchColleges, saveProfile } = useProfile();
 
  const [fullName,   setFullName]   = useState("");
  const [college,    setCollege]    = useState("");
  const [department, setDepartment] = useState("");
  const [position,   setPosition]   = useState("");
  const [step,       setStep]       = useState<1 | 2>(1);
 
  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    fetchColleges();
  }, [fetchColleges, router]);
 
  // Reset department when college changes
  useEffect(() => { setDepartment(""); }, [college]);
 
  const departments = college && colleges ? colleges.colleges[college] ?? [] : [];
  const positions   = colleges?.positions ?? [];
 
  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) { setError("Please enter your full name."); return; }
    if (!college)         { setError("Please select your college."); return; }
    if (!department)      { setError("Please select your department."); return; }
    setStep(2);
  };
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!position) { setError("Please select your position."); return; }
    const ok = await saveProfile({ full_name: fullName, college, department, position });
    if (ok) router.replace("/exams");
  };
 
  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ maxWidth: 460 }}>
 
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          {[1, 2].map(n => (
            <div
              key={n}
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: step >= n ? "var(--orange)" : "var(--border)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
 
        <h1 className="auth-title" style={{ fontSize: "1.35rem" }}>
          {step === 1 ? "Set up your profile" : "Your position"}
        </h1>
        <p className="auth-subtitle">
          {step === 1
            ? "Tell us about yourself so colleagues can find you by college."
            : "Almost done — select your academic position."}
        </p>
 
        {error && (
          <div role="alert" aria-live="assertive" className="alert alert-error">
            {error}
          </div>
        )}
 
        {/* ── Step 1: name + college + department ── */}
        {step === 1 && (
          <form onSubmit={handleNext} noValidate>
            <div className="field">
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                aria-label="Full name"
                aria-required="true"
                autoFocus
              />
            </div>
 
            {/* College selector — styled like our dropdowns */}
            <div className="field" style={{ marginBottom: "1rem" }}>
              <label
                htmlFor="college-select"
                style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}
              >
                College
              </label>
              <select
                id="college-select"
                className="dropdown"
                style={{ width: "100%" }}
                value={college}
                onChange={e => setCollege(e.target.value)}
                aria-required="true"
              >
                <option value="">Select college…</option>
                {Object.entries(COLLEGE_FULL_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>{code} — {name}</option>
                ))}
              </select>
            </div>
 
            <div className="field" style={{ marginBottom: "1.25rem" }}>
              <label
                htmlFor="dept-select"
                style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}
              >
                Department
              </label>
              <select
                id="dept-select"
                className="dropdown"
                style={{ width: "100%" }}
                value={department}
                onChange={e => setDepartment(e.target.value)}
                disabled={!college}
                aria-required="true"
                aria-disabled={!college}
              >
                <option value="">{college ? "Select department…" : "Select a college first"}</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
 
            <button type="submit" className="btn-primary">
              Continue →
            </button>
          </form>
        )}
 
        {/* ── Step 2: position ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} noValidate>
            {/* Summary of step 1 */}
            <div style={{
              background: "var(--bg)",
              borderRadius: "var(--radius-sm)",
              padding: "0.75rem 1rem",
              marginBottom: "1.25rem",
              fontSize: "0.875rem",
              color: "var(--navy)",
              lineHeight: 1.6,
            }}>
              <strong>{fullName}</strong><br />
              <span style={{ color: "var(--text-muted)" }}>
                {COLLEGE_FULL_NAMES[college]} ({college})<br />
                {department}
              </span>
            </div>
 
            <div className="field" style={{ marginBottom: "1.25rem" }}>
              <label
                htmlFor="position-select"
                style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}
              >
                Academic Position
              </label>
              <select
                id="position-select"
                className="dropdown"
                style={{ width: "100%" }}
                value={position}
                onChange={e => setPosition(e.target.value)}
                aria-required="true"
                autoFocus
              >
                <option value="">Select position…</option>
                {positions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
 
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading
                ? <><span className="spinner" aria-hidden="true" /> Saving…</>
                : "Save & continue"}
            </button>
 
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "100%", marginTop: "0.6rem", justifyContent: "center" }}
              onClick={() => { setStep(1); setError(null); }}
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}