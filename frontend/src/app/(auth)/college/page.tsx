"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { College, COLLEGE_OPTIONS } from "@/types/profile";
import { setActiveCollege, COLLEGE_COLORS, COLLEGE_FULL_NAMES } from "@/lib/college";
import { isAuthenticated } from "@/lib/auth";
 
export default function CollegePickerPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<College | null>(null);
  const [mounted,  setMounted]  = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);
 
  if (!mounted) return null;
 
  const handleContinue = () => {
    if (!selected) return;
    setActiveCollege(selected);
    router.replace("/exams");
  };
 
  return (
    <div className="auth-bg" style={{ flexDirection: "column", gap: "2rem" }}>
      {/* Heading */}
      <div style={{ textAlign: "center" }}>
        <h1 className="auth-title" style={{ fontSize: "1.6rem", marginBottom: "0.3rem" }}>
          Who is teaching today?
        </h1>
        <p className="auth-subtitle" style={{ marginBottom: 0 }}>
          Select your college to continue
        </p>
      </div>
 
      {/* 2×2 college grid */}
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
          const col     = COLLEGE_COLORS[value];
          const isActive = selected === value;
 
          return (
            <button
              key={value}
              role="radio"
              aria-checked={isActive}
              onClick={() => setSelected(value)}
              style={{
                background:   isActive ? "#fffbf4" : "var(--surface, #fff)",
                border:       `2px solid ${isActive ? "var(--orange, #f5a623)" : "var(--border, #d4e8ed)"}`,
                borderRadius: "var(--radius, 16px)",
                padding:      "1.5rem 1.25rem",
                cursor:       "pointer",
                display:      "flex",
                flexDirection:"column",
                alignItems:   "center",
                gap:          "0.75rem",
                position:     "relative",
                transition:   "border-color .15s, background .15s",
              }}
            >
              {/* Checkmark badge */}
              <span
                aria-hidden="true"
                style={{
                  position:   "absolute",
                  top:        10,
                  right:      10,
                  width:      20,
                  height:     20,
                  borderRadius: "50%",
                  background: "var(--orange, #f5a623)",
                  display:    "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity:    isActive ? 1 : 0,
                  transition: "opacity .15s",
                  fontSize:   12,
                  color:      "#fff",
                  fontWeight: 700,
                }}
              >
                ✓
              </span>
 
              {/* Initials circle */}
              <div
                style={{
                  width:          56,
                  height:         56,
                  borderRadius:   "50%",
                  background:     col.bg,
                  color:          col.color,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       "1.1rem",
                  fontWeight:     600,
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
 
      {/* Continue button */}
      <button
        className="btn-primary"
        onClick={handleContinue}
        disabled={!selected}
        aria-disabled={!selected}
        style={{ maxWidth: 260 }}
      >
        Continue →
      </button>
    </div>
  );
}