"use client";
/**
 * components/admin/TeacherCorrections.tsx
 * =======================================
 * NEW 2026-11-25 — Ms. Melanie, Recommendations page 19, requirement 1:
 *
 *     "Admin side can monitor how many the teachers recorrected answer"
 *
 * ITS OWN SECTION, not a column in the Accounts table above. A column would
 * have meant four coordinated edits inside that table - a header, a cell,
 * the colSpan on its empty row, and a second fetch - and the drill-down
 * needs a surface of its own regardless. Sorted by most-corrected, it is
 * also a better answer to "monitor" than a number in a table ordered by
 * user_id.
 *
 * TWO NUMBERS, AND THE GAP BETWEEN THEM IS THE POINT.
 *
 *   Corrections  every answer on this teacher's exams that a person has
 *                typed over. paper_scores.ocr_confidence IS NULL, which
 *                override_answer sets precisely because the reading no
 *                longer stands.
 *   Kept         how many of those were kept as evidence about the reader,
 *                in ocr_correction_samples.
 *
 * Kept is always the smaller one and that is by design, not a fault:
 * correction_service.sample_worth_keeping refuses a second correction of the
 * same item, a correction to or from blank, and a contested `a|b` reading,
 * because none of them says anything about the recogniser.
 *
 * MEASURED ON PRODUCTION, 2026-11-25: 10 answers re-corrected, 1 sample
 * kept. Counting the samples table - the obvious implementation - would have
 * reported one tenth of the real number. Both are shown so that the specimen
 * table further down this page and this section cannot appear to disagree.
 *
 * READ-ONLY. Two GETs; nothing here changes anything.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { teacherCorrectionService } from "@/services/teacherCorrectionService";
import type {
  CorrectedAnswer, TeacherCorrectionCount,
} from "@/types/teacherCorrection";

const th: React.CSSProperties = {
  textAlign: "left", padding: "0.4rem 0.6rem", fontSize: "0.68rem",
  letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "0.4rem 0.6rem", fontSize: "0.82rem",
  borderBottom: "1px solid var(--border)", verticalAlign: "middle",
};
const tdNum: React.CSSProperties = {
  ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
};
const mini: React.CSSProperties = {
  fontSize: "0.72rem", padding: "0.2rem 0.5rem", borderRadius: 6,
  border: "1px solid var(--border)", background: "transparent",
  cursor: "pointer", color: "var(--text-muted)",
};

/**
 * WHY A CORRECTION MIGHT NOT BE RECORDED — written once.
 *
 * The cell and the column header above it say the same thing, and a sentence
 * written twice is a sentence that drifts. It also stops being a multi-line
 * string literal inside a JSX attribute, which carried its own newlines into
 * the tooltip.
 */
const NOT_KEPT =
  "Not kept as evidence about the reader. That happens when the item had "
  + "already been corrected once, when the correction was to or from a blank, "
  + "or when the reading was contested — none of those say anything about the "
  + "recogniser.";

/** A reading the teacher replaced, or a note when it was not kept. */
function ReaderSaw({ item }: { item: CorrectedAnswer }) {
  if (item.reader_saw === null) {
    return (
      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
            title={NOT_KEPT}>
        not recorded
      </span>
    );
  }
  return (
    <>
      <code style={{ fontSize: "0.78rem" }}>{item.reader_saw}</code>
      {item.reader_confidence !== null && (
        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem",
                       marginLeft: "0.4rem" }}>
          {/* The confidence the reader reported for the reading it got
              WRONG. Sir Alex's point 5: was it confident when it was wrong?
              A high number here is the interesting case. */}
          {item.reader_confidence.toFixed(0)}% sure
        </span>
      )}
    </>
  );
}

export default function TeacherCorrections() {
  const [rows,     setRows]     = useState<TeacherCorrectionCount[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [chosen,    setChosen]    = useState<TeacherCorrectionCount | null>(null);
  const [items,     setItems]     = useState<CorrectedAnswer[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [busy,      setBusy]      = useState(false);

  const token = () => getToken() ?? "";

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await teacherCorrectionService.counts(token())); }
    catch (e) {
      setError(e instanceof ApiError ? e.message
             : e instanceof Error ? e.message : "Could not load the counts.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (r: TeacherCorrectionCount) => {
    setBusy(true); setError(null);
    try {
      const d = await teacherCorrectionService.detail(r.user_id, token());
      setItems(d.items); setTruncated(d.truncated); setChosen(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message
             : e instanceof Error ? e.message : "Could not load that teacher.");
    } finally { setBusy(false); }
  };

  const total = rows.reduce((n, r) => n + r.corrections, 0);

  return (
    <section style={{ marginTop: "2.2rem" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--navy)",
                   fontSize: "1.05rem", margin: "0 0 0.3rem" }}>
        Corrections by teacher
      </h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6,
                  margin: "0 0 1rem", maxWidth: 680 }}>
        How many scanned answers each teacher has had to type over. A high number
        is not a complaint about the teacher — it is where the reader is costing
        someone the most time.
      </p>

      {error && (
        <p role="alert" style={{
          fontSize: "0.82rem", lineHeight: 1.5, color: "#b42318",
          background: "#fef3f2", border: "1px solid #fda29b",
          borderRadius: 8, padding: "0.55rem 0.75rem", marginBottom: "1rem",
          maxWidth: 680,
        }}>
          {error}
        </p>
      )}

      {chosen === null ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 820 }}>
              <thead>
                <tr>
                  <th style={th}>Teacher</th>
                  <th style={{ ...th, textAlign: "right" }}
                      title="Every answer on this teacher's exams that a person has typed over.">
                    Corrections
                  </th>
                  <th style={{ ...th, textAlign: "right" }}
                      title={"How many of those were kept as evidence about the "
                             + "reader. Always the smaller number. " + NOT_KEPT}>
                    Kept as evidence
                  </th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.user_id}>
                    <td style={td}>
                      {r.name ?? r.email}
                      <span style={{ color: "var(--text-muted)",
                                     fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                        {r.name ? r.email : `#${r.user_id}`}
                      </span>
                    </td>
                    <td style={{ ...tdNum, fontWeight: r.corrections ? 600 : 400,
                                 color: r.corrections ? "var(--navy)"
                                                      : "var(--text-muted)" }}>
                      {r.corrections}
                    </td>
                    <td style={{ ...tdNum, color: "var(--text-muted)" }}>
                      {r.samples}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {/* No button on a row with nothing to show. An empty
                          list behind a button is a worse answer than no
                          button, because it looks like a failure. */}
                      {r.corrections > 0 && (
                        <button style={mini} disabled={busy}
                                onClick={() => open(r)}>
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={4}>
                    No accounts.
                  </td></tr>
                )}
                {loading && (
                  <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={4}>
                    Loading…
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && rows.length > 0 && (
            <p style={{ fontSize: "0.76rem", color: "var(--text-muted)",
                        marginTop: "0.6rem" }}>
              {total} answer{total === 1 ? "" : "s"} re-corrected across the
              installation.
            </p>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.8rem",
                        flexWrap: "wrap", marginBottom: "0.6rem" }}>
            <button style={mini} onClick={() => setChosen(null)}>
              ← All teachers
            </button>
            <strong style={{ fontSize: "0.9rem", color: "var(--navy)" }}>
              {chosen.name ?? chosen.email}
            </strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {items.length} correction{items.length === 1 ? "" : "s"}
            </span>
          </div>

          {truncated && (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)",
                        marginBottom: "0.6rem" }}>
              Showing the first {items.length}. There are more than a dialog can
              usefully hold.
            </p>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Exam</th>
                  <th style={{ ...th, textAlign: "right" }}>Item</th>
                  <th style={th}>The reader saw</th>
                  <th style={th}>Corrected to</th>
                  <th style={th}>Answer key</th>
                  <th style={th}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.score_id}>
                    <td style={td}>
                      {i.exam_name}
                      <span style={{ color: "var(--text-muted)",
                                     fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                        #{i.exam_id}
                      </span>
                    </td>
                    <td style={tdNum}>{i.question_number}</td>
                    <td style={td}><ReaderSaw item={i} /></td>
                    <td style={td}><code style={{ fontSize: "0.78rem" }}>{i.answer}</code></td>
                    <td style={td}><code style={{ fontSize: "0.78rem" }}>{i.correct_answer}</code></td>
                    <td style={td}>
                      <span style={{
                        fontSize: "0.68rem", fontWeight: 700, borderRadius: 20,
                        padding: "1px 8px", textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: i.verdict === "correct" ? "#05603a"
                             : i.verdict === "review"  ? "#7a3e00" : "#b42318",
                        background: i.verdict === "correct" ? "#ecfdf3"
                                  : i.verdict === "review"  ? "var(--orange-light, #fff4e5)"
                                                            : "#fef3f2",
                      }}>
                        {i.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={6}>
                    Nothing to show.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}