// NEW 2026-09-22 — page opened by the link in the reset email.
// Suspense is required because ResetPasswordForm uses useSearchParams().
import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}