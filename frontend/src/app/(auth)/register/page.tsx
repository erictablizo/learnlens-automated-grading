"use client"
/**
 * /register — ADMINS ONLY as of 2026-11-24.
 *
 * Ms. Melanie, Recommendations page 19:
 *   requirement 2  "Remove this option in Landing Page" (the "Create an
 *                   account" link on /login)
 *   requirement 1  "Admin can create accounts, edit and delete"
 *   requirement 4  the admin's "Create New Account" opens THIS page
 *
 * Removing the link from the login screen hid a door. This locks it: the
 * route still has to exist, because requirement 4 sends the admin here, so
 * deleting the page was never the answer.
 *
 * A SENTENCE, NOT A REDIRECT. Someone who lands here is told why, the same
 * way app/(dashboard)/admin/page.tsx answers a teacher who reaches /admin —
 * its note says the 403 case "renders a SENTENCE, not an empty table", and
 * for the same reason: a silent bounce to /login looks like a broken link.
 *
 * THIS IS A NAVIGATION GUARD, NOT THE AUTHORISATION. The server decides on
 * every request. If POST /api/auth/register is open to anyone, it is still
 * open to anyone with curl, and this page cannot change that — closing it is
 * a backend change and is listed as outstanding.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import RegisterForm from "@/components/auth/RegisterForm";
import { getToken } from "@/lib/auth";
import { adminService } from "@/services/adminService";

export default function RegisterPage() {
  /* null = still asking. Starting null rather than false means the form is
     not flashed at someone who is about to be refused, and the refusal is
     not flashed at an admin who is about to be allowed. */
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { setAllowed(false); return; }
    adminService.isAdmin(token).then(setAllowed);
  }, []);

  if (allowed === null) {
    return (
      <div className="auth-bg">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <span className="spinner spinner-dark" aria-hidden="true" /> Checking…
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="auth-bg">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <h1 className="auth-title">Accounts are created by your administrator</h1>
          <p className="auth-subtitle">
            Teacher accounts for LearnLens are set up by an administrator, so there
            is nothing to fill in here. Ask yours to add you, then sign in with the
            email they used.
          </p>
          <p className="auth-footer" style={{ marginTop: "1rem" }}>
            <Link href="/login" className="link-orange">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return <RegisterForm />;
}