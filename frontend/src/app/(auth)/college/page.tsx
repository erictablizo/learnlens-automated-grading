"use client";
/**
 * ENHANCEMENT 2026-10-01 — two steps instead of one.
 *
 * Picking a college used to go straight to /exams. Now it advances to a second
 * step on the same page, where the teacher says WHICH COURSE and WHICH YEAR
 * LEVEL they are teaching today, then Continue goes to /exams.
 *
 *   Step 1  Who is teaching today?   → the same 2×2 college grid
 *   Step 2  What are you teaching?   → course (filtered by college) + year level
 *
 * The year levels come from MAX_YEAR_BY_COLLEGE in types/profile.ts — CVMAS
 * reaches 6th year, the others reach 3rd. The pick is kept in sessionStorage
 * next to the active college (lib/college.ts), so Sign out and Switch clear it
 * and nothing is written to the database.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  College, COLLEGE_OPTIONS, COURSES_BY_COLLEGE,
  YearLevel, YEAR_LABELS, yearLevelsFor,
} from "@/types/profile";
import {
  setActiveCollege, setTeachingSelection, getTeachingContext,
  COLLEGE_COLORS, COLLEGE_FULL_NAMES,
} from "@/lib/college";
import { isAuthenticated } from "@/lib/auth";
 
export default function CollegePickerPage() {
  const router   = useRouter();
  const [mounted, setMounted]   = useState(false);
  const [picking, setPicking]   = useState<College | null>(null);

  // Added on 2026-10-01 — step 2
  const [step,    setStep]    = useState<"college" | "details">("college");
  const [course,  setCourse]  = useState("");
  const [year,    setYear]    = useState<YearLevel | "">("");
  const [error,   setError]   = useState<string | null>(null);
  const [going,   setGoing]   = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);
 
  if (!mounted) return null;
 
  // Clicking a card sets the college, then asks what they are teaching
  const handlePick = (college: College) => {
    setPicking(college);
    setActiveCollege(college);          // this clears a course/year from another college
    // if they are re-picking the same college, bring their last choice back
    const previous = getTeachingContext();
    setCourse(previous?.course ?? "");
    setYear(previous?.year ?? "");
    setError(null);
    // Small visual delay so the selection highlight is visible before step 2
    setTimeout(() => setStep("details"), 220);
  };

  const handleBack = () => {
    setStep("college");
    setPicking(null);
    setError(null);
  };

  const handleContinue = () => {
    if (!picking) { handleBack(); return; }
    if (!course) { setError("Please select the course you are teaching."); return; }
    if (!year)   { setError("Please select the year level you are teaching."); return; }
    setGoing(true);
    setTeachingSelection(course, year);
    router.replace("/exams");
  };

  const selectStyle = {
    width:        "100%",
    border:       "none",
    borderBottom: "1.5px solid var(--border)",
    background:   "transparent",
    padding:      "0.7rem 0.2rem",
    fontSize:     "0.95rem",
    outline:      "none",
    marginBottom: "1rem",
  } as const;
 
  return (
    <div className="auth-bg" style={{ flexDirection: "column", gap: "1.75rem" }}>
 
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <h1 className="auth-title" style={{ fontSize: "1.6rem", marginBottom: "0.3rem" }}>
          {step === "college" ? "Who is teaching today?" : "What are you teaching?"}
        </h1>
        <p className="auth-subtitle" style={{ marginBottom: 0 }}>
          {step === "college"
            ? "Select your college to continue"
            : picking ? COLLEGE_FULL_NAMES[picking] : ""}
        </p>
      </div>

      {/* ── Step 2 — course + year level ───────────────────────────────────── */}
      {step === "details" && picking && (
        <div
          style={{
            width: "100%", maxWidth: 440,
            background:   "var(--surface, #fff)",
            border:       "2px solid var(--border, #d4e8ed)",
            borderRadius: "var(--radius, 16px)",
            padding:      "1.5rem 1.5rem 1.25rem",
          }}
        >
          {/* which college this is for */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
            <span style={{
              width: 40, height: 40, borderRadius: "50%",
              background: COLLEGE_COLORS[picking].bg, color: COLLEGE_COLORS[picking].color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.72rem", fontWeight: 700, flexShrink: 0,
              fontFamily: "var(--font-heading, sans-serif)",
            }}>
              {COLLEGE_COLORS[picking].initials}
            </span>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--navy, #1a2e44)" }}>
              {picking}
            </span>
            <button
              type="button"
              onClick={handleBack}
              disabled={going}
              className="link-orange"
              style={{
                background: "none", border: "none", cursor: going ? "default" : "pointer",
                marginLeft: "auto", fontSize: "0.78rem", padding: 0,
              }}
            >
              Change college
            </button>
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          <label className="form-label" htmlFor="teaching-course" style={{ marginBottom: "0.2rem" }}>
            Course <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <select
            id="teaching-course"
            value={course}
            onChange={e => { setCourse(e.target.value); setError(null); }}
            disabled={going}
            aria-required="true"
            style={{ ...selectStyle, color: course ? "var(--text)" : "var(--text-muted)" }}
          >
            <option value="">Select the course you are teaching</option>
            {COURSES_BY_COLLEGE[picking].map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label className="form-label" htmlFor="teaching-year" style={{ marginBottom: "0.2rem" }}>
            Year Level <span aria-hidden="true" style={{ color: "var(--error)" }}>*</span>
          </label>
          <select
            id="teaching-year"
            value={year === "" ? "" : String(year)}
            onChange={e => {
              const v = e.target.value;
              setYear(v === "" ? "" : (Number(v) as YearLevel));
              setError(null);
            }}
            disabled={going}
            aria-required="true"
            style={{ ...selectStyle, color: year ? "var(--text)" : "var(--text-muted)" }}
          >
            <option value="">Select the year level you are teaching</option>
            {yearLevelsFor(picking).map(y => (
              <option key={y} value={y}>{YEAR_LABELS[y]}</option>
            ))}
          </select>

          <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "-0.5rem", marginBottom: "1.1rem" }}>
            {COLLEGE_FULL_NAMES[picking]} students go up to{" "}
            {YEAR_LABELS[yearLevelsFor(picking)[yearLevelsFor(picking).length - 1]]}.
          </p>

          <button
            type="button"
            className="btn-primary"
            onClick={handleContinue}
            disabled={going}
            aria-busy={going}
          >
            {going ? <><span className="spinner" aria-hidden="true" /> Opening…</> : "Continue"}
          </button>
        </div>
      )}
 
      {/* ── Step 1 — 2×2 college grid ──────────────────────────────────────── */}
      {step === "college" && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          width: "100%",
          maxWidth: 560,
        }}
        role="radiogroup"
        aria-label="Select your college"
      >
        {COLLEGE_OPTIONS.map(({ value }) => {
          const col      = COLLEGE_COLORS[value];
          const isActive = picking === value;
 
          return (
            <button
              key={value}
              role="radio"
              aria-checked={isActive}
              onClick={() => handlePick(value)}
              disabled={picking !== null}
              style={{
                background:    isActive ? "#fffbf4" : "var(--surface, #fff)",
                border:        `2px solid ${isActive ? "var(--orange, #f5a623)" : "var(--border, #d4e8ed)"}`,
                borderRadius:  "var(--radius, 16px)",
                padding:       "1.5rem 1.25rem",
                cursor:        picking ? "default" : "pointer",
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           "0.75rem",
                position:      "relative",
                transition:    "border-color .15s, background .15s",
              }}
            >
              {/* Check badge */}
              <span
                aria-hidden="true"
                style={{
                  position:       "absolute",
                  top: 10, right: 10,
                  width:          20, height: 20,
                  borderRadius:   "50%",
                  background:     "var(--orange, #f5a623)",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  opacity:        isActive ? 1 : 0,
                  transition:     "opacity .15s",
                  fontSize:       12,
                  color:          "#fff",
                  fontWeight:     700,
                }}
              >
                ✓
              </span>
 
              {/* Loading spinner inside the picked card */}
              {isActive && (
                <span
                  className="spinner spinner-dark"
                  aria-label="Loading…"
                  style={{ position: "absolute", bottom: 10, right: 10, width: 14, height: 14, borderWidth: 2 }}
                />
              )}
 
              {/* Initials circle */}
              <div
                style={{
                  width:          56, height:         56,
                  borderRadius:   "50%",
                  background:     col.bg, color: col.color,
                  display:        "flex", alignItems: "center", justifyContent: "center",
                  fontSize:       "1.1rem", fontWeight: 600,
                  fontFamily:     "var(--font-heading, sans-serif)",
                }}
              >
                {col.initials}
              </div>
 
              {/* Abbreviation */}
              <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--navy, #1a2e44)" }}>
                {value}
              </span>
 
              {/* Full name */}
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #7a8fa6)", textAlign: "center", lineHeight: 1.4 }}>
                {COLLEGE_FULL_NAMES[value]}
              </span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}