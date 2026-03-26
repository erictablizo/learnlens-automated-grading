'use client';

import { useState } from 'react';

interface Paper {
  paper_id: number;
  student_name: string;
  total_score: number | null;
  checked: boolean;
}

interface AddEditPaperModalProps {
  examId: number;
  paper?: Paper | null;
  onClose: () => void;
  onSave: () => void;
}

export default function AddEditPaperModal({ examId, paper, onClose, onSave }: AddEditPaperModalProps) {
  const [studentName, setStudentName] = useState(paper?.student_name || '');
  const [pages, setPages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPages(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setError('Student name is required');
      return;
    }
    if (pages.length === 0 && !paper) {
      setError('Please upload at least one page');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('student_name', studentName);
      if (paper) {
        formData.append('paper_id', String(paper.paper_id));
      }
      pages.forEach((page, idx) => {
        formData.append(`page_${idx + 1}`, page);
      });

      const url = paper
        ? `${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/test-papers/${paper.paper_id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/test-papers`;
      const method = paper ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to save paper');
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <h3 className="text-lg font-medium mb-4">
          {paper ? 'Edit Test Paper' : 'Add Test Paper'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Student Name</label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-primary focus:border-primary"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Upload Pages (images or PDF)</label>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="mt-1 block w-full"
            />
            {paper && pages.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">Leave empty to keep existing pages.</p>
            )}
          </div>
          {error && <div className="error-message mb-4">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}