"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Paper } from "@/types/paper";
import { paperService } from "@/services/paperService";
import { getToken } from "@/lib/auth";
// CHANGED 2026-11-04: checkNamePart replaces checkStudentName, and the three
// display helpers are what pre-fill the two boxes for a legacy paper.
import { checkNamePart, tidyText, paperLastName, paperFirstName, needsNameSplit }
  from "@/lib/textField";
// NEW 2026-10-23 (Doc Rubrica, 5th comment): several pages in one dialog.
import { planPageFiles } from "@/lib/pageFiles";

interface ExistingPage {
  paper_page_id: number;
  page_number:   number;
  image_path:    string;
  file:          File | null;   // null = keep existing
  removed:       boolean;       // true = user removed it
}

// CHANGED 2026-10-23: the cap was a literal 10 inside the Pages dropdown.
// Named here so the dropdown and the multi-file picker use the same number.
const MAX_PAGES = 10;

interface Props {
  paper:     Paper;
  examId:    number;
  // NEW 2026-11-03: the modal had no way to know how many pages the exam has,
  // so the Pages dropdown offered 1..10 regardless and a 3-page exam happily
  // accepted a 1-page paper. The parent already knows this number.
  examPages: number;
  onClose:   () => void;
  onSuccess: (msg: string) => void;
}

// ── Confirmation dialog for already-checked papers ────────────────────────────
function ConfirmDialog({
  onYes, onNo,
}: { onYes: () => void; onNo: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(10,20,40,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1100, backdropFilter: "blur(2px)",
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
    >
      <div style={{
        background: "var(--surface)", borderRadius: "var(--radius)",
        padding: "2rem", maxWidth: 400, width: "90%",
        boxShadow: "var(--shadow-lg)",
      }}>
        <p id="confirm-title" style={{ fontWeight: 600, color: "var(--navy)", marginBottom: "0.6rem", fontSize: "1rem" }}>
          Are you sure you want to continue?
        </p>
        {/* CHANGED 2026-11-04. This used to read "Proceeding will reset the
            score of this entry." - which was true, because handleSave reset the
            score on ANY save of a checked paper. The hand-split of the 18 old
            papers needs a NAME-ONLY save, and MEASURED against this project's
            own OCR timings that reset would have cost 4.8-27.9 minutes of
            re-grading for 18 papers, 9.3-54.3 for 35, to change a name. The
            reset is conditional now, so this sentence is conditional too. */}
        <p id="confirm-desc" style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
          This test paper has already been checked. If you change or remove a
          page image, the score will be reset and the paper must be checked
          again. Changing only the name will not reset it.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Button variant="secondary" onClick={onNo}>No</Button>
          <Button variant="primary" onClick={onYes} style={{ width: "auto", padding: "0.6rem 1.5rem" }}>
            Yes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main EditPaperModal ───────────────────────────────────────────────────────
export default function EditPaperModal({ paper, examId, examPages, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"confirm" | "form">(
    paper.checked ? "confirm" : "form"
  );

  // CHANGED 2026-11-04 (Doc Rubrica, page 4). One box becomes two, and on a
  // paper that predates the migration they are PRE-FILLED from a best-effort
  // split of student_name. That is what turns "split 18 rows by hand" into
  // "check 18 pre-filled forms".
  //
  // MEASURED, the four shapes that exist in the data:
  //   "Tablizo, Eric"               -> Tablizo / Eric            saveable as-is
  //   "Dela Cruz-Santos, Ma. Teresa" -> both parts                saveable as-is
  //   "Santos"                      -> Santos / (blank)          BLOCKED, first name required
  //   "Midterm – Alcantara, Ben R."  -> Midterm – Alcantara / ... BLOCKED, en-dash refused
  // The last two are the point: the form refuses to save until a person fixes
  // them. "Midterm - Alcantara" with an ASCII hyphen does NOT get blocked, so
  // PapersTable carries a "needs split" badge as the backstop.
  const [lastName,  setLastName]  = useState(() => paperLastName(paper));
  const [firstName, setFirstName] = useState(() => paperFirstName(paper));
  const [lastNameError,  setLastNameError]  = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [pages,       setPages]       = useState<ExistingPage[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Initialise page list from existing paper pages
  useEffect(() => {
    const existing: ExistingPage[] = (paper.paper_pages ?? []).map(pp => ({
      paper_page_id: pp.paper_page_id,
      page_number:   pp.page_number,
      image_path:    pp.image_path,
      file:          null,
      removed:       false,
    }));
    setPages(existing);
  }, [paper]);

  // Page count dropdown — can add pages
  const pageCount = pages.filter(p => !p.removed).length;
    // NEW 2026-11-03: the paper must carry at least as many pages as the exam.
  const MIN_PAGES = Math.max(1, examPages);

  // MIN_PAGES..MAX_PAGES, plus this paper's CURRENT count when it is already
  // below the minimum. A paper saved before this guard existed would otherwise
  // have a <select> whose value matches no option — the trap Create Exam hit on
  // 2026-10-23 with value={12} against options 1..10 — leaving the row blank
  // and un-editable. handleSave still refuses it, so the teacher is told to add
  // the missing pages rather than being stuck.
  const pageOptions = Array.from({ length: MAX_PAGES }, (_, i) => i + 1)
    .filter(n => n >= MIN_PAGES || n === pageCount);

  const handlePageCountChange = (n: number) => {
    const current = pages.filter(p => !p.removed);
    if (n > current.length) {
      // Add blank new pages
      const newPages: ExistingPage[] = Array.from(
        { length: n - current.length },
        (_, i) => ({
          paper_page_id: -(Date.now() + i), // negative = new (not in DB)
          page_number:   current.length + i + 1,
          image_path:    "",
          file:          null,
          removed:       false,
        })
      );
      setPages(prev => [...prev.filter(p => !p.removed), ...newPages]);
    } else if (n < current.length) {
      // Mark last N pages as removed
      const toRemove = current.length - n;
      const ids = current.slice(-toRemove).map(p => p.paper_page_id);
      setPages(prev => prev.map(p =>
        ids.includes(p.paper_page_id) ? { ...p, removed: true } : p
      ));
    }
  };

  const handleRemovePage = (id: number) => {
    setPages(prev => prev.map(p =>
      p.paper_page_id === id ? { ...p, removed: true, file: null } : p
    ));
  };

  /**
   * CHANGED 2026-10-23 (Doc Rubrica, 5th comment): the picker is `multiple`,
   * and a selection fills this page and the pages after it, adding any that do
   * not exist. Picking ONE file behaves exactly as it did before.
   *
   * Positions are counted over the ACTIVE pages, because a page removed with ✕
   * stays in `pages` with removed=true and must not consume a slot.
   */
  const handleFilesSelected = (id: number, list: FileList | null) => {
    const active = pages.filter(p => !p.removed);
    const startPos = active.findIndex(p => p.paper_page_id === id);
    if (startPos < 0) return;

    const plan = planPageFiles({
      files: list, startIndex: startPos, currentRows: active.length, maxRows: MAX_PAGES,
    });
    if (plan.assign.length === 0) {
      if (plan.message) setError(plan.message);
      return;
    }

    setPages(prev => {
      const next = [...prev];
      let activeCount = next.filter(p => !p.removed).length;
      let seq = 0;
      while (activeCount < plan.totalRows) {
        next.push({
          paper_page_id: -(Date.now() + seq++),   // negative = new, not in the DB
          page_number:   activeCount + 1,
          image_path:    "",
          file:          null,
          removed:       false,
        });
        activeCount++;
      }
      const act = next.filter(p => !p.removed);
      for (const { index, file } of plan.assign) {
        const row = act[index];
        if (!row) continue;
        next[next.indexOf(row)] = { ...row, file };
      }
      return next;
    });
    setError(plan.message);
  };

  const handleSave = async () => {
    setError(null);

    // NEW 2026-11-03: a paper with fewer pages than the exam leaves whole
    // parts of the answer key with no student answer, and nothing downstream
    // reports it — the Pages dropdown used to offer 1..10 regardless of the
    // exam, so a 3-page exam accepted a 1-page paper without a word.
    if (pageCount < MIN_PAGES) {
      setError(`This exam has ${examPages} page(s). The paper must have all ${examPages}.`);
      return;
    }

    // NEW 2026-11-04 — thesis p.5, "It can be saved without Image", which was
    // still live on THIS screen. MEASURED: raise Pages from 1 to 3 and save
    // without uploading anything, and the count guard above PASSES (3 >= 3)
    // while the upload loop below runs `if (pg.file)` and sends nothing. The
    // teacher is told "Paper updated successfully." and the paper still has one
    // page. Add Paper and Edit Exam both have this check; Edit Paper did not.
    const active = pages.filter(p => !p.removed);
    const blank = active.find(p => !p.file && !p.image_path);
    if (blank) {
      setError(`Please upload an image for Page ${blank.page_number}.`);
      return;
    }

    // CHANGED 2026-11-04 (Doc Rubrica): two fields now, same rule, same words
    // and same order as check_name_part() in backend/app/schemas/_text.py.
    setLastNameError(null);
    setFirstNameError(null);
    const lastMsg = checkNamePart(lastName, "Last name");
    if (lastMsg) { setLastNameError(lastMsg); setError(lastMsg); return; }
    const firstMsg = checkNamePart(firstName, "First name");
    if (firstMsg) { setFirstNameError(firstMsg); setError(firstMsg); return; }

    const token = getToken();
    if (!token) return;
    setSaving(true);

    // NEW 2026-11-04. Did anything that affects GRADING change? Only an image
    // replaced, or an existing page deleted. A blank added page cannot reach
    // here any more - the check above refuses it.
    const pagesChanged =
      pages.some(p => p.file) ||
      pages.some(p => p.removed && p.paper_page_id > 0);

    try {
      // 1. Update the name. One object, not positional strings - see the note
      //    in AddEditPaperModal. The server recomposes student_name from the
      //    pair, so every screen that reads student_name stays correct.
      await paperService.updateName(
        examId, paper.paper_id,
        { last_name: tidyText(lastName), first_name: tidyText(firstName) },
        token,
      );

      // 2. Delete removed pages
      const removed = pages.filter(p => p.removed && p.paper_page_id > 0);
      for (const pg of removed) {
        await paperService.deletePage(examId, paper.paper_id, pg.paper_page_id, token);
      }

      // 3. Upload new/replacement pages
      for (const pg of active) {
        if (pg.file) {
          await paperService.uploadPage(examId, paper.paper_id, pg.page_number, pg.file, token);
        }
      }

      // 4. CHANGED 2026-11-04: reset the score only when a page actually
      //    changed. This used to be `if (paper.checked)` alone, so splitting a
      //    name on a checked paper wiped its score - and the hand-split needs
      //    exactly that save, on 18 papers. MEASURED cost of the old
      //    behaviour, at this project's 16-31 s per page: 4.8-27.9 minutes of
      //    re-grading for 18 papers, 9.3-54.3 for 35, to change a name.
      if (paper.checked && pagesChanged) {
        await paperService.resetScore(examId, paper.paper_id, token);
      }

      onSuccess("Paper updated successfully.");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong while updating the paper. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmation step (already-checked papers) ──────────────────────────────
  if (step === "confirm") {
    return (
      <ConfirmDialog
        onYes={() => setStep("form")}
        onNo={onClose}
      />
    );
  }

  // ── Edit form ────────────────────────────────────────────────────────────────
  const activePages = pages.filter(p => !p.removed);
  const unsplit = needsNameSplit(paper);

  const nameErr = (msg: string | null) =>
    msg && (
      <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "-0.9rem", marginBottom: "0.9rem" }}>
        {msg}
      </p>
    );

  return (
    <Modal title="Edit Paper" onClose={onClose}>
      {error && (
        <div role="alert" aria-live="assertive" className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* NEW 2026-11-04. Says WHY the two boxes are pre-filled with a guess,
          so the teacher checks them instead of trusting them. Shown only on a
          paper that still needs splitting. */}
      {unsplit && (
        <div role="status" style={{
          marginBottom: "1rem", padding: "0.6rem 0.8rem", fontSize: "0.8rem",
          lineHeight: 1.5, color: "var(--navy)", background: "var(--orange-light)",
          border: "1px solid var(--orange)", borderRadius: "var(--radius-sm)",
        }}>
          This paper was saved before Last Name and First Name were separate
          fields. They have been filled in from <strong>{paper.student_name}</strong> as
          a best guess — please check them before saving.
        </div>
      )}

      {/* Name — two fields as of 2026-11-04 */}
      <label className="form-label" htmlFor="edit-last-name">Last Name</label>
      <input
        id="edit-last-name"
        className="form-input"
        value={lastName}
        onChange={e => { setLastName(e.target.value); setLastNameError(null); setError(null); }}
        placeholder="e.g. Dela Cruz-Santos"
        aria-required="true"
        aria-invalid={!!lastNameError}
        disabled={saving}
        style={lastNameError ? { borderBottomColor: "var(--error)" } : undefined}
      />
      {nameErr(lastNameError)}

      <label className="form-label" htmlFor="edit-first-name">First Name</label>
      <input
        id="edit-first-name"
        className="form-input"
        value={firstName}
        onChange={e => { setFirstName(e.target.value); setFirstNameError(null); setError(null); }}
        placeholder="e.g. Ma. Teresa"
        aria-required="true"
        aria-invalid={!!firstNameError}
        disabled={saving}
        style={firstNameError ? { borderBottomColor: "var(--error)" } : undefined}
      />
      {nameErr(firstNameError)}

      {/* Page count */}
      <div style={{ marginBottom: "1rem" }}>
        <label className="form-label" htmlFor="edit-page-count">Pages</label>
        <select
          id="edit-page-count"
          className="dropdown"
          value={activePages.length}
          onChange={e => handlePageCountChange(Number(e.target.value))}
          style={{ width: "80px" }}
          disabled={saving}
        >
          {pageOptions.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {examPages > 0 && (
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "0.6rem" }}>
            The exam has {examPages} page(s).
          </span>
        )}
      </div>

      {/* Pages table */}
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
        You can select several images in one go — they are placed in page order by file name.
      </p>

      <div className="table-wrapper" style={{ marginBottom: "1.25rem" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Page</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody>
            {activePages.map(pg => {
              const isNew      = pg.paper_page_id < 0;
              const hasExisting = !isNew && pg.image_path;
              const filename   = pg.file
                ? pg.file.name
                : hasExisting
                ? pg.image_path.split(/[/\\]/).pop() ?? ""
                : "";

              return (
                <tr key={pg.paper_page_id}>
                  <td>{pg.page_number}</td>
                  <td>
                    {hasExisting && !pg.file ? (
                      /* Existing image — show filename + remove button */
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--navy)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {filename}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePage(pg.paper_page_id)}
                          aria-label={`Remove page ${pg.page_number}`}
                          style={{
                            background: "none", border: "none",
                            color: "var(--error)", cursor: "pointer",
                            fontSize: "1rem", lineHeight: 1, padding: "0 0.1rem",
                          }}
                          disabled={saving}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      /* New upload or replaced */
                      <label style={{
                        display: "inline-flex", alignItems: "center", gap: "0.5rem",
                        cursor: "pointer",
                        background: pg.file ? "var(--orange-light)" : "var(--navy)",
                        color: pg.file ? "var(--orange)" : "#fff",
                        border: pg.file ? "1px solid var(--orange)" : "none",
                        borderRadius: "6px",
                        padding: "0.35rem 0.8rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                      }}>
                        {pg.file
                          ? `✓ ${pg.file.name.slice(0, 20)}${pg.file.name.length > 20 ? "…" : ""}`
                          : `Upload Page ${pg.page_number}`}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ display: "none" }}
                          onChange={e => {
                            handleFilesSelected(pg.paper_page_id, e.target.files);
                            e.target.value = "";
                          }}
                          disabled={saving}
                        />
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          style={{ width: "auto", padding: "0.65rem 1.5rem" }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}