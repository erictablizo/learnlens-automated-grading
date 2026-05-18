"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { College, COLLEGE_OPTIONS } from "@/types/profile";
import { setActiveCollege, COLLEGE_COLORS, COLLEGE_FULL_NAMES } from "@/lib/college";
import { isAuthenticated } from "@/lib/auth";
 
export default function CollegePickerPage() {
  const router  = useRouter();
  const [mounted, setMounted] = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);
 
  if (!mounted) return null;
 
  // Single click → set college → navigate immediately (no button)
  const handlePick = (college: College) => {
    setActiveCollege(college);
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
 
      {/* 2×2 grid — click immediately navigates */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          width: "100%",
          maxWidth: 560,
        }}
        role="list"
        aria-label="Select your college"
      >
        {COLLEGE_OPTIONS.map(({ value }) => {
          const col = COLLEGE_COLORS[value];
          return (
            <button
              key={value}
              role="listitem"
              onClick={() => handlePick(value)}
              style={{
                background:    "#fff",
                border:        "2px solid var(--border, #d4e8ed)",
                borderRadius:  "16px",
                padding:       "1.5rem 1.25rem",
                cursor:        "pointer",
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           "0.75rem",
                transition:    "border-color .12s, background .12s, transform .1s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--orange, #f5a623)";
                (e.currentTarget as HTMLButtonElement).style.background  = "#fffbf4";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border, #d4e8ed)";
                (e.currentTarget as HTMLButtonElement).style.background  = "#fff";
              }}
              onMouseDown={e  => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
              onMouseUp={e    => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              aria-label={`Select ${COLLEGE_FULL_NAMES[value]}`}
            >
              {/* Initials circle */}
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: col.bg, color: col.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.05rem", fontWeight: 700,
                fontFamily: "var(--font-heading, sans-serif)",
              }}>
                {col.initials}
              </div>
 
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy, #1a2e44)" }}>
                {value}
              </span>
 
              <span style={{
                fontSize: "0.75rem", color: "var(--text-muted, #7a8fa6)",
                textAlign: "center", lineHeight: 1.45,
              }}>
                {COLLEGE_FULL_NAMES[value]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}