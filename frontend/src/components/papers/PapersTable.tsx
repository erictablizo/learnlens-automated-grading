"use client";
import { Paper } from "@/types/paper";
import Button from "@/components/ui/Button";
// NEW 2026-11-04 (Doc Rubrica, page 4): "Paper Table: [Last Name] [First Name]".
// These three read a MIXED table - papers entered from now on have the two
// columns, the 18 that predate the migration have only student_name - so the
// JSX below needs no branch of its own.
import { paperLastName, paperFirstName, needsNameSplit } from "@/lib/textField";
// NEW 2026-11-11 — "score as X/Y" (Alex Passion / Julius Bancud). One shared
// function writes every score in the app, so the list and the paper viewer can
// never disagree about what a paper scored.
import { formatRowScore } from "@/lib/scoreLabel";

const IconEdit = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3 1 1-3a4 4 0 01.94-1.414z" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

interface Props {
  papers:          Paper[];
  selectedPaperId: number | null;
  onSelect:        (paper: Paper) => void;
  onEdit:          (paper: Paper) => void;
  onDelete:        (paper: Paper) => void;
  /**
   * NEW 2026-11-11 — how many items the exam's answer key has, for the X/Y.
   *
   * The parent has it already: `exam.answer_keys.length`. REQUIRED rather than
   * optional, and nullable rather than defaulted, so a caller that does not
   * have the number has to say so instead of silently sending 0 — "11 / 0" is
   * a worse answer than "11".
   */
  totalItems:      number | null;
  /**
   * NEW 2026-11-11 — "View Exam sorted alphabetically" (Alex & Bancud).
   *
   * Defaults to the alphabetical order they asked for. `"added"` is kept
   * because insertion order is what matches a physical stack of papers on a
   * desk, and someone will eventually want it back; having the prop means that
   * is a change in the parent rather than in here.
   */
  sort?:           "name" | "added";
}

/**
 * NEW 2026-11-11 — surname, then given name, then paper_id.
 *
 * Reads through paperLastName / paperFirstName, the SAME functions the cells
 * render, so a legacy row sorts where it is shown rather than where its raw
 * student_name would put it. Sorting on the raw column would scatter the 18
 * unsplit papers away from their own displayed names.
 *
 * `localeCompare` with `sensitivity: "base"` so case and accents do not split
 * the alphabet — "de la Cruz" and "De La Cruz" are the same surname, and
 * Filipino names carry ñ. `numeric: true` keeps "Santos 2" after "Santos 1".
 *
 * paper_id last so the order is STABLE: two students genuinely called
 * "Cruz, Ana" must not swap places between renders.
 */
function bySurname(a: Paper, b: Paper): number {
  const opts: Intl.CollatorOptions = { sensitivity: "base", numeric: true };
  const last = paperLastName(a).localeCompare(paperLastName(b), undefined, opts);
  if (last !== 0) return last;
  const first = paperFirstName(a).localeCompare(paperFirstName(b), undefined, opts);
  if (first !== 0) return first;
  return a.paper_id - b.paper_id;
}

/**
 * CHANGED 2026-11-11. Was the bare `total_score`, with no denominator and no
 * sign of whether the paper was finished.
 *
 * MEASURED on the real paper of 2026-10-24: `total_score` is 11 on a paper
 * whose true score is 15, because four items were still under review and the
 * stored total is a FLOOR. The old cell printed "11" with nothing to say so.
 * formatRowScore writes "11+ of 19" for that paper and "15 / 19" once the
 * reviews are resolved, and `title` carries the full sentence for either.
 */
function ScoreCell({ paper, totalItems }: { paper: Paper; totalItems: number | null }) {
  const { label, title } = formatRowScore(paper, totalItems);
  const unscored = paper.total_score === null || paper.total_score === undefined;
  return (
    <span
      title={title}
      style={
        unscored
          ? { color: "var(--text-muted)", fontSize: "0.8rem" }
          : { fontWeight: 700, color: "var(--navy)", fontSize: "0.82rem", whiteSpace: "nowrap" }
      }
    >
      {label}
    </span>
  );
}

/** NEW 2026-11-04. The marker on a row whose name has not been split yet.
 *
 *  It exists because the character rule CANNOT catch the bad case: MEASURED,
 *  "Midterm - Alcantara" with an ASCII hyphen pre-fills Edit Paper, passes
 *  checkNamePart and saves wrong unless a person notices. The teacher spotting
 *  it unaided is not a control; a visible marker is. */
function SplitBadge() {
  return (
    <span
      title="This paper's name has not been split into Last name and First name yet. Open Edit Paper to split it."
      style={{
        marginLeft: "0.4rem", fontSize: "0.68rem", fontWeight: 700,
        color: "var(--orange)", background: "var(--orange-light)",
        border: "1px solid var(--orange)", borderRadius: "10px",
        padding: "0.05rem 0.4rem", whiteSpace: "nowrap",
      }}
    >
      needs split
    </span>
  );
}

const HEAD = (
  <tr>
    <th style={{ width: 40 }}>ID</th>
    <th>Last Name</th>
    <th>First Name</th>
    {/* CHANGED 2026-11-11: 80 -> 110. "11+ of 19" does not fit in 80px and
        would have wrapped mid-score. */}
    <th style={{ width: 110 }}>Score</th>
    <th style={{ width: 90 }}>Actions</th>
  </tr>
);

export default function PapersTable({
  papers, selectedPaperId, onSelect, onEdit, onDelete, totalItems, sort = "name",
}: Props) {
  if (papers.length === 0) {
    return (
      <div className="table-wrapper">
        <table>
          <thead>{HEAD}</thead>
          <tbody>
            <tr>
              {/* CHANGED 2026-11-04: colSpan 4 -> 5. Two name columns now. */}
              <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                No test papers added yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // NEW 2026-11-11. `.slice()` first: sorting in place would mutate the array
  // the parent holds in state, which React does not expect and which makes the
  // order depend on how many times this rendered.
  const rows = sort === "name" ? papers.slice().sort(bySurname) : papers;

  return (
    <div className="table-wrapper">
      <table aria-label="Test papers">
        <thead>{HEAD}</thead>
        <tbody>
          {rows.map((p, idx) => {
            const isSelected = p.paper_id === selectedPaperId;
            const unsplit    = needsNameSplit(p);
            const nameStyle  = {
              fontWeight: isSelected ? 600 : 500,
              color:      isSelected ? "var(--orange)" : "var(--navy)",
            };
            return (
              <tr
                key={p.paper_id}
                onClick={() => onSelect(p)}
                aria-selected={isSelected}
                style={{
                  cursor:     "pointer",
                  background: isSelected ? "var(--orange-light)" : undefined,
                  outline:    isSelected ? "1.5px solid var(--orange)" : undefined,
                }}
              >
                {/* This column has always been the ROW NUMBER, not paper_id -
                    it renumbers whenever a paper is added or removed. Sorting
                    renumbers it too, which is consistent: row 1 is now the
                    alphabetically first student. */}
                <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{idx + 1}</td>
                {/* The two columns read through paperLastName / paperFirstName,
                    so a legacy row shows its best-effort split rather than a
                    blank cell - and carries the badge saying so. */}
                <td style={nameStyle}>
                  {paperLastName(p) || "—"}
                  {unsplit && <SplitBadge />}
                </td>
                <td style={nameStyle}>{paperFirstName(p) || "—"}</td>
                <td><ScoreCell paper={p} totalItems={totalItems} /></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    {/* aria-label still uses student_name, which is composed
                        server-side and therefore never stale. That is the
                        payoff of keeping the column rather than dropping it. */}
                    <Button
                      variant="icon"
                      onClick={() => onEdit(p)}
                      aria-label={`Edit ${p.student_name}`}
                      title="Edit paper"
                      style={{ color: "var(--orange)" }}
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      variant="danger-icon"
                      onClick={() => onDelete(p)}
                      aria-label={`Delete ${p.student_name}`}
                      title="Delete paper"
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}