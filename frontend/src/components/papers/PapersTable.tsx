import { FiEdit, FiEye } from 'react-icons/fi';

interface Paper {
  paper_id: number;
  student_name: string;
  total_score: number | null;
  checked: boolean;
}

interface PapersTableProps {
  papers: Paper[];
  onEdit: (paper: Paper) => void;
  onView: (paper: Paper) => void;
}

export default function PapersTable({ papers, onEdit, onView }: PapersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {papers.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                No test papers added yet.
              </td>
            </tr>
          ) : (
            papers.map((paper) => (
              <tr key={paper.paper_id}>
                <td className="px-6 py-4 whitespace-nowrap">{paper.student_name}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {paper.total_score !== null ? paper.total_score : 'Not graded'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap space-x-2">
                  <button
                    onClick={() => onEdit(paper)}
                    className="text-primary hover:text-primary-dark"
                    title="Edit"
                  >
                    <FiEdit />
                  </button>
                  <button
                    onClick={() => onView(paper)}
                    className="text-gray-600 hover:text-gray-800"
                    title="View"
                  >
                    <FiEye />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}