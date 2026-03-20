"use client"
import CheckEmailDialogBox from "@/components/auth/CheckEmailDialogBox";
 
export default function CheckEmailPage() {
  return (
    <main className="auth-bg">
      <CheckEmailDialogBox />
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