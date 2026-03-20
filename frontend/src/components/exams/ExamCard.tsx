"use client";
 
import { Exam } from "@/types/user";
 
interface ExamCardProps {
  exam: Exam;
  onEdit?: (exam: Exam) => void;
  onDelete?: (examId: number) => void;
}
 
export default function ExamCard({ exam, onEdit, onDelete }: ExamCardProps) {
  return (
    <div className="card">
      {/* Thumbnail */}
      <div className="thumbnail">
        <div className="test-sheet">
          <div className="sheet-header">TEST</div>
          <div className="sheet-lines">
            <span className="check">✓</span><div className="line" />
            <span className="check">✓</span><div className="line" />
            <span className="check">✓</span><div className="line short" />
          </div>
        </div>
        <div className="pencil-accent" />
        <div className="settings-dot">⚙</div>
      </div>
 
      {/* Info */}
      <div className="info">
        <h3 className="exam-name">{exam.exam_name}</h3>
        <p className="exam-desc">
          {exam.description.length > 22
            ? exam.description.slice(0, 22) + "…"
            : exam.description}
        </p>
      </div>
 
      {/* Actions */}
      <div className="actions">
        <button
          className="action-btn edit-btn"
          onClick={() => onEdit?.(exam)}
          title="Edit exam"
        >
          ✏
        </button>
        <button
          className="action-btn delete-btn"
          onClick={() => onDelete?.(exam.exam_id)}
          title="Delete exam"
        >
          🗑
        </button>
      </div>
 
      <style jsx>{`
        .card {
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
          width: 160px;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .card:hover {
          transform: translateY(-3px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        }
        .thumbnail {
          position: relative;
          background: linear-gradient(135deg, #e8f4f8 0%, #d0eaf2 100%);
          height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .test-sheet {
          background: #fff;
          border-radius: 4px;
          width: 68px;
          padding: 8px 10px;
          box-shadow: 2px 2px 6px rgba(0,0,0,0.12);
          z-index: 1;
        }
        .sheet-header {
          font-size: 0.7rem;
          font-weight: 800;
          color: #1a2e4a;
          letter-spacing: 1px;
          text-align: center;
          margin-bottom: 6px;
        }
        .sheet-lines {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sheet-lines > * {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .check {
          font-size: 0.55rem;
          color: #27ae60;
        }
        .line {
          height: 2px;
          background: #c8d6e5;
          border-radius: 2px;
          flex: 1;
        }
        .line.short { width: 60%; flex: none; }
        .pencil-accent {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%) rotate(15deg);
          width: 10px;
          height: 60px;
          background: linear-gradient(180deg, #f5a623 0%, #e09610 60%, #f5c842 100%);
          border-radius: 2px 2px 4px 4px;
          box-shadow: 1px 1px 4px rgba(0,0,0,0.15);
        }
        .settings-dot {
          position: absolute;
          bottom: 6px;
          right: 6px;
          font-size: 0.7rem;
          color: #7a9bb5;
          cursor: pointer;
        }
        .info {
          padding: 10px 12px 6px;
          flex: 1;
        }
        .exam-name {
          font-size: 0.88rem;
          font-weight: 600;
          color: #1a2e4a;
          margin: 0 0 4px;
        }
        .exam-desc {
          font-size: 0.75rem;
          color: #8a9bb0;
          margin: 0;
          line-height: 1.4;
        }
        .actions {
          padding: 6px 12px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .action-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.9rem;
          padding: 2px 4px;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .action-btn:hover { background: #f0f4f8; }
        .edit-btn { color: #f5a623; }
        .delete-btn { color: #e74c3c; }
      `}</style>
    </div>
  );
}