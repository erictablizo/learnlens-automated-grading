"use client"
import RegisterForm from "@/components/auth/RegisterForm";
 
export default function RegisterPage() {
  return (
    <main className="auth-bg">
      <RegisterForm />
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