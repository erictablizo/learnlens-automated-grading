"use client";
import { useEffect, useRef } from "react";
 
interface Props {
  title:       string;
  message:     string;
  confirmLabel?: string;
  cancelLabel?:  string;
  onConfirm:   () => void;
  onCancel:    () => void;
  dangerous?:  boolean;   // true = confirm button is red, false = orange (default)
}
 
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel  = "No",
  onConfirm,
  onCancel,
  dangerous = false,
}: Props) {
  const yesRef = useRef<HTMLButtonElement>(null);
 
  // Focus the Yes button on mount; close on Escape
  useEffect(() => {
    yesRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);
 
  return (
    <div
      style={{
        position:   "fixed",
        inset:      0,
        background: "rgba(10,20,40,0.45)",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex:     1200,
        backdropFilter: "blur(2px)",
        padding:    "1rem",
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background:   "var(--surface)",
          borderRadius: "var(--radius)",
          padding:      "1.75rem 1.75rem 1.5rem",
          maxWidth:     420,
          width:        "100%",
          boxShadow:    "var(--shadow-lg)",
        }}
      >
        {/* Title */}
        <p
          id="confirm-title"
          style={{
            fontWeight:   600,
            fontSize:     "1rem",
            color:        "var(--navy)",
            marginBottom: "0.6rem",
          }}
        >
          {title}
        </p>
 
        {/* Message */}
        <p
          id="confirm-desc"
          style={{
            fontSize:     "0.875rem",
            color:        "var(--text-muted)",
            lineHeight:   1.55,
            marginBottom: "1.5rem",
          }}
        >
          {message}
        </p>
 
        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button
            onClick={onConfirm}
            ref={yesRef}
            style={{
              background:   dangerous ? "var(--error)" : "var(--orange)",
              color:        "#fff",
              border:       "none",
              borderRadius: "50px",
              padding:      "0.55rem 1.5rem",
              fontSize:     "0.875rem",
              fontWeight:   600,
              cursor:       "pointer",
              fontFamily:   "var(--font-body)",
              transition:   "background .15s",
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              background:   "transparent",
              color:        "var(--navy)",
              border:       "1.5px solid var(--border)",
              borderRadius: "50px",
              padding:      "0.55rem 1.5rem",
              fontSize:     "0.875rem",
              fontWeight:   500,
              cursor:       "pointer",
              fontFamily:   "var(--font-body)",
              transition:   "border-color .15s",
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}