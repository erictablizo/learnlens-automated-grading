"use client";

interface QuestionTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: "true_false" | "encircled") => void;
  loading?: boolean;
}

export default function QuestionTypeModal({
  isOpen,
  onClose,
  onSelect,
  loading = false,
}: QuestionTypeModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "var(--radius-md)",
          padding: "2rem",
          maxWidth: 400,
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            marginBottom: "1rem",
            color: "var(--navy)",
          }}
        >
          Select Question Type
        </h2>

        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          What type of questions does this exam contain?
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column" }}>
          <button
            onClick={() => onSelect("true_false")}
            disabled={loading}
            style={{
              padding: "0.75rem 1rem",
              background: "var(--success-bg)",
              color: "var(--success)",
              border: "1px solid var(--success)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Generating…" : "True/False (Written)"}
          </button>

          <button
            onClick={() => onSelect("encircled")}
            disabled={loading}
            style={{
              padding: "0.75rem 1rem",
              background: "var(--primary-bg)",
              color: "var(--primary)",
              border: "1px solid var(--primary)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Generating…" : "Multiple Choice (Circled)"}
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}