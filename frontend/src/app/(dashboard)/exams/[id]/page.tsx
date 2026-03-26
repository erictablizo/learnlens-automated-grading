'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import PapersTable from '@/components/papers/PapersTable';
import AddEditPaperModal from '@/components/papers/AddEditPaperModal';
import ViewPaperModal from '@/components/papers/ViewPaperModal';
import { FiEdit } from 'react-icons/fi'; // for edit icon

interface Exam {
  exam_id: number;
  exam_name: string;
  description: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface AnswerKey {
  answer_key_id: number;
  page_id: number;
  question_number: number;
  correct_answer: string;
}

interface TestPaper {
  paper_id: number;
  student_name: string;
  total_score: number | null;
  checked: boolean;
}

export default function ViewExamPage() {
  const params = useParams();
  const examId = params.examId as string;
  const { user, isLoading: authLoading } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [testPapers, setTestPapers] = useState<TestPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPaperModal, setShowAddPaperModal] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<TestPaper | null>(null);
  const [showViewPaperModal, setShowViewPaperModal] = useState(false);
  const [generatingAnswerKey, setGeneratingAnswerKey] = useState(false);

  useEffect(() => {
    if (!examId) return;
    fetchExamDetails();
  }, [examId]);

  const fetchExamDetails = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const examRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const examData = await examRes.json();
      setExam(examData);

      const answerKeysRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/answer-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const answerKeysData = await answerKeysRes.json();
      setAnswerKeys(answerKeysData);

      const papersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/test-papers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const papersData = await papersRes.json();
      setTestPapers(papersData);
    } catch (error) {
      console.error('Failed to load exam details', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAnswerKey = async () => {
    setGeneratingAnswerKey(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/generate-answer-key`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });
      if (!response.ok) throw new Error('Generation failed');
      // Refresh answer keys
      const updated = await response.json();
      setAnswerKeys(updated);
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingAnswerKey(false);
    }
  };

  const handleAddPaper = () => {
    setSelectedPaper(null);
    setShowAddPaperModal(true);
  };

  const handleEditPaper = (paper: TestPaper) => {
    setSelectedPaper(paper);
    setShowAddPaperModal(true);
  };

  const handleViewPaper = (paper: TestPaper) => {
    setSelectedPaper(paper);
    setShowViewPaperModal(true);
  };

  const handlePaperSaved = () => {
    setShowAddPaperModal(false);
    fetchExamDetails(); // refresh list
  };

  if (loading || authLoading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!exam) {
    return <div className="p-6 text-center">Exam not found</div>;
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar is already in layout */}
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Exam Header */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold">{exam.exam_name}</h1>
                <p className="text-gray-600 mt-2">{exam.description}</p>
              </div>
              <button className="text-primary hover:text-primary-dark flex items-center gap-1">
                <FiEdit /> Edit Exam
              </button>
            </div>
          </div>

          {/* Answer Key Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Answer Key</h2>
              <button
                onClick={handleGenerateAnswerKey}
                disabled={generatingAnswerKey}
                className="btn-primary"
              >
                {generatingAnswerKey ? 'Generating...' : 'Generate Answer Key'}
              </button>
            </div>
            {answerKeys.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question #</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Correct Answer</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {answerKeys.map((ak) => (
                      <tr key={ak.answer_key_id}>
                        <td className="px-6 py-4 whitespace-nowrap">{ak.question_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{ak.correct_answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No answer key generated yet.</p>
            )}
          </div>

          {/* Test Papers Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Test Papers</h2>
              <button onClick={handleAddPaper} className="btn-primary">
                + Add Paper
              </button>
            </div>
            <PapersTable
              papers={testPapers}
              onEdit={handleEditPaper}
              onView={handleViewPaper}
            />
          </div>
        </div>

        {/* Modals */}
        {showAddPaperModal && (
          <AddEditPaperModal
            examId={parseInt(examId)}
            paper={selectedPaper}
            onClose={() => setShowAddPaperModal(false)}
            onSave={handlePaperSaved}
          />
        )}
        {showViewPaperModal && selectedPaper && (
          <ViewPaperModal
            paper={selectedPaper}
            examId={parseInt(examId)}
            onClose={() => setShowViewPaperModal(false)}
          />
        )}
      </main>
    </div>
  );
}
