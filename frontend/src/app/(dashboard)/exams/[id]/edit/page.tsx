"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import EditExamForm from "@/components/exams/EditExamForm";
import { isAuthenticated } from "@/lib/auth";
 
export default function EditExamPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.id ?? params?.exam_id ?? 0);
 
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);
 
  if (!examId) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content">
          <div className="alert alert-error" role="alert">Invalid exam ID.</div>
        </main>
      </div>
    );
  }
 
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <EditExamForm examId={examId} />
      </main>
    </div>
  );
}