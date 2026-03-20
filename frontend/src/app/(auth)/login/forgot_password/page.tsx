"use client"
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
 
export default function ForgotPasswordPage() {
  return (
    <main className="auth-bg">
      <ForgotPasswordForm />
      <style jsx>{`
        .auth-bg {
          min-height: 100vh;
          background: #c9eaf0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
      `}</style>
    </main>
  );
}