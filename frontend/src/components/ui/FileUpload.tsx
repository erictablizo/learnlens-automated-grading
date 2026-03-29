"use client";
import { useRef, useState } from "react";
 
interface FileUploadProps {
  label?: string;
  accept?: string;
  onFile: (file: File) => void;
}
 
export default function FileUpload({ label = "Click or drag an image here", accept = "image/*", onFile }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
 
  const handleFile = (file: File) => {
    setFileName(file.name);
    onFile(file);
  };
 
  return (
    <div
      className={`upload-zone${drag ? " drag" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      role="button"
      aria-label={label}
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        aria-hidden="true"
      />
      {fileName ? (
        <span style={{ color: "var(--navy)", fontWeight: 500 }}>📎 {fileName}</span>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}