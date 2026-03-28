"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import CreateExamForm from "@/components/exams/CreateExamForm";
import { isAuthenticated } from "@/lib/auth";
 
export default function CreateExamPage() {
  const router = useRouter();
  useEffect(() => { if (!isAuthenticated()) router.replace("/login"); }, [router]);
 
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <CreateExamForm />
      </main>
    </div>
  );
}