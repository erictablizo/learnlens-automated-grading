"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import ExamGrid from "@/components/exams/ExamGrid";
import { useExams } from "@/hooks/useExams";
import { isAuthenticated, getToken } from "@/lib/auth";
import { hasActiveCollege, getActiveCollege, COLLEGE_FULL_NAMES, COLLEGE_COLORS } from "@/lib/college";
import { profileService } from "@/services/profileService";
import { UserProfile, College } from "@/types/profile";
import { Exam } from "@/types/exam";
 
const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");
 
function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  return `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
}
 
export default function ManageExamsPage() {
  const router  = useRouter();
  const { exams, isLoading, error, usingDemo, fetchExams, deleteExam } = useExams();
  const [mounted,  setMounted]  = useState(false);
  const [profile,  setProfile]  = useState<UserProfile | null>(null);
  const [imgError, setImgError] = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated())  { router.replace("/login");   return; }
    if (!hasActiveCollege()) { router.replace("/college"); return; }
 
    fetchExams();
 
    // Load profile for avatar + display name
    const token = getToken();
    if (token) {
      profileService.get(token)
        .then(p => { setProfile(p); setImgError(false); })
        .catch(() => {});
    }
  }, [fetchExams, router]);
 
  const handleAdd    = () => router.push("/exams/create");
  const handleEdit   = (exam: Exam) => router.push(`/exams/${exam.exam_id}`);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this exam? This cannot be undone.")) return;
    await deleteExam(id);
  };
 
  if (!mounted) return null;
 
  const college     = getActiveCollege() as College | null;
  const collegeName = college ? COLLEGE_FULL_NAMES[college] : null;
  const col         = college ? COLLEGE_COLORS[college] : null;
 
  const firstName  = profile?.first_name ?? "";
  const lastName   = profile?.last_name  ?? "";
  const fullName   = [firstName, lastName].filter(Boolean).join(" ");
  const course     = profile?.course    ?? "";
  const position   = profile?.position  ?? "Teacher";
  const displayName = fullName && course
    ? `${fullName}, ${course} ${position}`
    : fullName || "";
 
  const initials   = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || col?.initials || "?";
  const avatarSrc  = profile ? avatarUrl(profile.avatar_path) : null;
 
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content" aria-label="Manage Exams">
 
        {/* ── Top identity bar ── */}
        <div style={{
          display:       "flex",
          alignItems:    "center",
          gap:           "0.75rem",
          marginBottom:  "1.25rem",
          paddingBottom: "1rem",
          borderBottom:  "1px solid var(--border)",
        }}>
          {/* Avatar */}
          <div style={{
            width:          48,
            height:         48,
            borderRadius:   "50%",
            overflow:       "hidden",
            border:         "2px solid var(--border)",
            background:     col?.bg ?? "var(--bg)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}>
            {avatarSrc && !imgError ? (
              <img
                src={avatarSrc}
                alt={fullName || "Profile"}
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
 
          {/* Name + college */}
          <div>
            {displayName && (
              <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--navy)", lineHeight: 1.3 }}>
                {displayName}
              </p>
            )}
            {collegeName && (
              <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                {collegeName}
              </p>
            )}
          </div>
        </div>
 
        <h1 className="page-title">Exams</h1>
 
        {/* Demo notice */}
        {usingDemo && !isLoading && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background:   "var(--orange-light)",
              border:       "1px solid var(--orange)",
              borderRadius: "var(--radius-sm)",
              padding:      "0.6rem 1rem",
              fontSize:     "0.82rem",
              color:        "var(--navy)",
              marginBottom: "1.25rem",
              display:      "flex",
              alignItems:   "center",
              gap:          "0.5rem",
            }}
          >
            <span>💡</span>
            <span>Showing demo exams — click <strong>+</strong> to create your first real exam.</span>
          </div>
        )}
 
        <div aria-live="polite" aria-atomic="true">
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              <span className="spinner spinner-dark" aria-hidden="true" />
              Loading exams…
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}
        </div>
 
        <ExamGrid exams={exams} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} />
      </main>
    </div>
  );
}