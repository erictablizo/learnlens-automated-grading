"use client"
import { Suspense } from "react";
import CheckEmailDialogBox from "@/components/auth/CheckEmailDialogBox";
 
export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="auth-bg" />}>
      <CheckEmailDialogBox />
    </Suspense>
  );
}