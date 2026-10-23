"use client";
/**
 * CHANGED 2026-10-23 — Doc Rubrica, fifth comment: she asked why pages are
 * added one at a time when she can select every answer sheet at once in File
 * Explorer.
 *
 * This zone had TWO single-file paths, and both are fixed here:
 *   - the hidden <input> read  e.target.files?.[0]
 *   - the drop handler read    e.dataTransfer.files[0]
 * The drop path matters as much as the picker: dragging 26 files onto the zone
 * used to silently take the first one.
 *
 * `onFiles` is the new callback and receives everything picked or dropped.
 * `onFile` is kept so any existing caller keeps working unchanged; when both
 * are supplied `onFiles` wins. Pass `multiple` to let the OS dialog select
 * more than one file.
 *
 *     Save as: frontend/src/components/ui/FileUpload.tsx
 */
import { useRef, useState } from "react";

interface FileUploadProps {
  label?: string;
  accept?: string;
  /** Allow the file dialog to select more than one file. */
  multiple?: boolean;
  /** Every file picked or dropped, in the order the browser gave them. */
  onFiles?: (files: File[]) => void;
  /** Legacy single-file callback. Still honoured when onFiles is absent. */
  onFile?: (file: File) => void;
}

export default function FileUpload({
  label = "Click or drag an image here",
  accept = "image/*",
  multiple = false,
  onFiles,
  onFile,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const handleFiles = (list: FileList | File[] | null | undefined) => {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;                 // dialog cancelled
    setPicked(files.length === 1
      ? files[0].name
      : `${files.length} images selected`);
    if (onFiles) onFiles(files);
    else if (onFile) onFile(files[0]);
  };

  return (
    <div
      className={`upload-zone${drag ? " drag" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false);
        // was: const f = e.dataTransfer.files[0]
        handleFiles(e.dataTransfer.files);
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
        multiple={multiple}
        style={{ display: "none" }}
        // e.target.value is cleared so picking the same file twice still fires
        onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
        aria-hidden="true"
      />
      {picked ? (
        <span style={{ color: "var(--navy)", fontWeight: 500 }}>📎 {picked}</span>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}