"use client";
/**
 * components/ui/Modal.tsx
 *
 * CHANGED 2026-11-22 — Sir Alex Passion, Recommendations page 14,
 * requirement 1:
 *
 *   "Reduce the Font Size and Display Area so that the two buttons 'Cancel'
 *    & 'Save' are still visible, or another option is to put scroll bar on
 *    the side."
 *
 * His screenshot is the Add Paper dialog with Cancel and Save cut off by the
 * bottom of the window. The dialog is not at fault: it renders through this
 * shell, and this shell put no limit on how tall the panel could grow. A
 * panel taller than the window, centred by the backdrop, hangs off both ends
 * — and because the page behind it does not scroll while a dialog is open,
 * there is nothing to scroll to reach the buttons.
 *
 * TWO LINES, AND THE SECOND OF HIS TWO OPTIONS. A cap plus a scrollbar beats
 * shrinking the font, because shrinking only moves the cliff to the next
 * longer form — Add Paper grew three name fields in November and will grow
 * again.
 *
 * WHY INLINE AND NOT IN globals.css. `.modal` is styled by class, so a rule
 * there would work too — but an inline style wins over a class rule without
 * !important, so this cannot be silently overridden by a stylesheet nobody
 * editing this file would think to open. It is also two properties in the
 * file that owns the panel, rather than two properties three directories
 * away.
 *
 * WHAT IT LOOKS LIKE. Short dialogs are untouched: a panel shorter than the
 * cap has nothing to scroll and no scrollbar appears. Tall ones gain a
 * scrollbar down the right-hand side — which is what the Generate Answer Key
 * dialog has always had, because that one sets its own panel style and never
 * went through this shell. Alex photographed both and only complained about
 * the one without it.
 *
 * `100vh` AND NOT `100dvh`. dvh would be better on a phone, where the URL bar
 * comes and goes, but a `min(100vh, 100dvh)` that a browser does not
 * understand is dropped whole — and a dropped declaration brings the bug
 * back with nothing to see. This is a teacher's laptop; vh is right there and
 * degrades to "scroll a little further" rather than to nothing.
 */
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
    /* CHANGED 2026-11-24 — Ms. Melanie, page 18 requirement 3, which now names
     * "Add Paper in View Exam" and "Edit Paper in View Exam": the cursor must
     * start in the first input box.
     *
     * THIS LINE WAS TAKING IT AWAY. autoFocus runs during commit; a parent's
     * effect runs after its children's, so the panel grabbed focus a moment
     * after the first box had it and the teacher was left typing nowhere. The
     * panel is only focused now if focus is not ALREADY inside the dialog,
     * which keeps the original purpose - a dialog opened with no focusable
     * child still takes focus off the page behind it - and lets a child that
     * asked for focus keep it. */
    const inside = ref.current?.contains(document.activeElement ?? null);
    if (!inside) ref.current?.focus();
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
      <div
        className="modal"
        ref={ref}
        tabIndex={-1}
        /* CHANGED 2026-11-22 — Alex page 14, requirement 1. See the note above. */
        style={{ maxHeight: "calc(100vh - 3rem)", overflowY: "auto" }}
      >
        <h2 className="modal-title" id="modal-title">{title}</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">✕</button>
        {children}
      </div>
    </div>
  );
}