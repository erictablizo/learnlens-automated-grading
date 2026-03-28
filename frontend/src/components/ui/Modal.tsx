"use client";
import { useEffect, useRef } from "react";
 
interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}
 
export default function Modal({ title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
 
  // Trap focus & close on Escape (HCI: user control and freedom)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
 
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" ref={ref} tabIndex={-1}>
        <h2 className="modal-title" id="modal-title">{title}</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">✕</button>
        {children}
      </div>
    </div>
  );
}