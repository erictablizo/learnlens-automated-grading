import CheckEmailDialogBox from "@/components/auth/CheckEmailDialogBox";

interface Props {
  searchParams: { email?: string };
}

export default function CheckEmailPage({ searchParams }: Props) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#b8dde8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CheckEmailDialogBox email={searchParams.email} />
    </main>
  );
}