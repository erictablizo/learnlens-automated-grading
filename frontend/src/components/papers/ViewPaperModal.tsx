'use client';

import { useState, useEffect } from 'react';

interface Paper {
  paper_id: number;
  student_name: string;
  total_score: number | null;
  checked: boolean;
}

interface ViewPaperModalProps {
  paper: Paper;
  examId: number;
  onClose: () => void;
}

export default function ViewPaperModal({ paper, examId, onClose }: ViewPaperModalProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [scores, setScores] = useState<{ question_number: number; student_answer: string; correct_answer: string; is_correct: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPaperDetails = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const pagesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/test-papers/${paper.paper_id}/pages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const pagesData = await pagesRes.json();
        setPages(pagesData.image_paths || []);

        const scoresRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}/test-papers/${paper.paper_id}/scores`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const scoresData = await scoresRes.json();
        setScores(scoresData);
      } catch (error) {
        console.error('Failed to load paper details', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPaperDetails();
  }, [paper, examId]);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">
            {paper.student_name} - Score: {paper.total_score !== null ? paper.total_score : 'Not graded'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <>
            {scores.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium mb-2">Grading Details</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Q#</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Student Answer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Correct Answer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {scores.map((score, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2">{score.question_number}</td>
                          <td className="px-4 py-2">{score.student_answer}</td>
                          <td className="px-4 py-2">{score.correct_answer}</td>
                          <td className="px-4 py-2">
                            {score.is_correct ? '✓' : '✗'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2">Uploaded Pages</h4>
              <div className="grid grid-cols-1 gap-4">
                {pages.map((pageUrl, idx) => (
                  <div key={idx} className="border rounded p-2">
                    <img src={pageUrl} alt={`Page ${idx+1}`} className="max-w-full h-auto" />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}