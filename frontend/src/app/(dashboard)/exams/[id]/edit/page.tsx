"use client";
import { useParams } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import EditExamForm from "@/components/exams/EditExamForm";

export default function EditExamPage() {
  const params = useParams();
  const examId = Number(params?.id ?? 0);

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <EditExamForm examId={examId} />
      </main>
    </div>
  );
}