"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import FileUpload from "@/components/ui/FileUpload";
import Button from "@/components/ui/Button";
import { usePapers } from "@/hooks/usePapers";
import { getToken } from "@/lib/auth";
import { paperService } from "@/services/paperService";
 
interface AddEditPaperModalProps {
  examId: number;
  onClose: () => void;
  onSuccess: () => void;
}
 
export default function AddEditPaperModal({ examId, onClose, onSuccess }: AddEditPaperModalProps) {
  const { createPaper, isLoading, error } = usePapers(examId);
  const [studentName, setStudentName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!studentName.trim()) { setLocalError("Student name is required."); return; }
 
    const paper = await createPaper({ student_name: studentName.trim() });
    if (!paper) return;
 
    // Upload first page if provided
    if (file) {
      const token = getToken();
      if (token) {
        try {
          await paperService.uploadPage(examId, paper.paper_id, 1, file, token);
        } catch {
          // Non-fatal: paper created, page upload failed
        }
      }
    }
    onSuccess();
    onClose();
  };
 
  return (
    <Modal title="Add Test Paper" onClose={onClose}>
      {(localError || error) && (
        <div role="alert" aria-live="assertive" className="alert alert-error">
          {localError || error}
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <label className="form-label" htmlFor="student-name">Student Name</label>
        <input
          id="student-name"
          className="form-input"
          value={studentName}
          onChange={e => setStudentName(e.target.value)}
          placeholder="e.g. Juan dela Cruz"
          aria-required="true"
          disabled={isLoading}
        />
 
        <label className="form-label" style={{ marginBottom: "0.4rem" }}>Paper Image (optional)</label>
        <FileUpload label="Upload page 1 image…" onFile={setFile} />
 
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={isLoading} style={{ width: "auto", padding: "0.65rem 1.5rem" }}>
            Add Paper
          </Button>
        </div>
      </form>
    </Modal>
  );
}