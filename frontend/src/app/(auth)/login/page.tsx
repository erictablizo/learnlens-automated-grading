import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#b8dde8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <LoginForm />
    </main>
  );
}