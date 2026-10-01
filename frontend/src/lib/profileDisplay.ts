/**
 * NEW 2026-10-01 — the sidebar's profile label, in one place.
 *
 * `avatarUrl` and `buildDisplayName` used to live inside Navbar.tsx, and the
 * Edit Profile page had its own copy of `avatarUrl`. The college picker needs
 * the same label, so rather than make a third copy they live here and all
 * three import them. Change the label once and every screen follows.
 *
 * Save as: frontend/src/lib/profileDisplay.ts
 */
import { UserProfile } from "@/types/profile";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const STATIC_BASE = API_BASE.replace("/api", "");

/**
 * Build the avatar URL from the stored path.
 * `v` (the profile's updated_at) busts the browser cache — the uploaded file
 * always has the same name (user_<id>.jpg), so without it a changed photo
 * keeps showing the old one.
 */
export function avatarUrl(path: string | null | undefined, v?: string | null): string | null {
  if (!path) return null;
  // path is like "uploads/avatars/user_1.jpg" — prepend the backend base
  const url = `${STATIC_BASE}/${path.replace(/\\/g, "/").replace(/^\//, "")}`;
  return v ? `${url}?v=${encodeURIComponent(v)}` : url;
}

/** Build "Maria Santos, Computer Science Teacher" */
export function buildDisplayName(profile: UserProfile): string {
  const first    = (profile.first_name ?? "").trim();
  const last     = (profile.last_name  ?? "").trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  const course   = (profile.course    ?? "").trim();
  const position = (profile.position  ?? "").trim() || "Teacher";

  if (fullName && course) return `${fullName}, ${course} ${position}`;
  if (fullName)           return `${fullName} ${position}`;
  return position;
}

/** "EB" from Eric Bernard Tablizo — shown when there is no photo. */
export function initialsOf(profile: UserProfile | null | undefined, fallback = "?"): string {
  if (!profile) return fallback;
  return [(profile.first_name ?? "")[0], (profile.last_name ?? "")[0]]
    .filter(Boolean).join("").toUpperCase() || fallback;
}