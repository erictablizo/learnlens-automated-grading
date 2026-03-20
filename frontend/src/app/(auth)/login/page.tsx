"use client"
import LoginForm from "@/components/auth/LoginForm";
 
export default function LoginPage() {
  return (
    <main className="auth-bg">
      <LoginForm />
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