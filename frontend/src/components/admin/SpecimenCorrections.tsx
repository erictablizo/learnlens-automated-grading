"use client";
/**
 * components/admin/SpecimenCorrections.tsx
 * ========================================
 * NEW 2026-11-19 — the Technical Admin specimen table.
 *
 *   Sir Alex Passion, 19 November 2026:
 *     5. "teach the algorithm to recognize E not as a dash"
 *     6. "Technical Admin — alphabet recognition handling; sample specimen to
 *         include E; add specimen recognition"
 *     7. "letter B"
 *     4. "corrections to cover Machine"
 *
 * Sits on the Administrator screen beside ReferenceLists, and follows that
 * file's conventions: inline style objects, one fetch on mount, errors shown
 * as a sentence rather than a code.
 *
 * THE COUNT BESIDE SAVE IS THE WHOLE POINT OF THIS SCREEN'S DESIGN.
 * Saving a correction re-checks every paper already in the system that
 * contains that reading - other teachers' papers included. That is the chosen
 * behaviour, not an accident, so the number of items and papers it will touch
 * is fetched while the administrator types and printed next to the button.
 * Nobody should be able to start it without having been told its size.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { correctionService } from "@/services/correctionService";
import type {
  AffectedCount, CorrectionSuggestion, OCRCorrection, RescoreSummary,
} from "@/types/correction";

const card: React.CSSProperties = {
  background: "var(--card, #fff)", border: "1px solid var(--border)",
  borderRadius: 12, padding: "1rem 1.1rem", marginTop: "1.25rem",
};
const h2: React.CSSProperties = {
  margin: 0, fontSize: "1rem", fontWeight: 700,
  fontFamily: "var(--font-heading)",
};
const sub: React.CSSProperties = {
  margin: "0.35rem 0 0.9rem", fontSize: "0.8rem", color: "var(--text-muted)",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "0.4rem 0.6rem", fontSize: "0.68rem",
  letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "0.4rem 0.6rem", fontSize: "0.82rem",
  borderBottom: "1px solid var(--border)", verticalAlign: "middle",
};
const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8rem", border: "1px solid var(--border)", borderRadius: 5,
  padding: "0.1rem 0.4rem",
};
const input: React.CSSProperties = {
  padding: "0.3rem 0.5rem", fontSize: "0.8rem",
  border: "1px solid var(--border)", borderRadius: 6,
};
const mini: React.CSSProperties = {
  fontSize: "0.72rem", padding: "0.2rem 0.5rem", borderRadius: 6,
  border: "1px solid var(--border)", background: "transparent",
  cursor: "pointer", color: "var(--text-muted)",
};
const primary: React.CSSProperties = {
  ...mini, background: "var(--navy)", borderColor: "var(--navy)",
  color: "#fff", padding: "0.3rem 0.7rem",
};
const label: React.CSSProperties = {
  fontSize: "0.68rem", letterSpacing: "0.04em", textTransform: "uppercase",
  color: "var(--text-muted)",
};

export default function SpecimenCorrections() {
  const [rows, setRows]       = useState<OCRCorrection[]>([]);
  const [sugs, setSugs]       = useState<CorrectionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string>("");
  const [busy, setBusy]       = useState(false);

  const [seen, setSeen]   = useState("");
  const [means, setMeans] = useState("");
  const [note, setNote]   = useState("");

  const [hits, setHits]       = useState<AffectedCount | null>(null);
  const [counting, setCounting] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [result, setResult]   = useState<RescoreSummary | null>(null);
  const [notice, setNotice]   = useState("");

  const load = useCallback(async () => {
    const token = getToken() ?? "";
    try {
      setRows(await correctionService.list(token));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the specimen list.");
    } finally {
      setLoading(false);
    }
    // Separate try: the suggestions are useful but not essential, and a
    // failure here must not make the list below look broken.
    try {
      setSugs(await correctionService.suggestions(token));
    } catch {
      setSugs([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* ── the blast radius, while they type ──────────────────────────────────
     400 ms debounce and a sequence guard, the pattern AddEditPaperModal uses:
     a slow earlier answer must never overwrite a newer one, or the number on
     the screen belongs to a reading that is no longer in the box.          */
  const seq = useRef(0);
  useEffect(() => {
    const value = seen.trim();
    const to = means.trim();
    setResult(null);
    if (!value) { setHits(null); setCounting(false); return; }
    const mine = ++seq.current;
    setCounting(true);
    const t = setTimeout(async () => {
      try {
        const got = await correctionService.affected(value, to, getToken() ?? "");
        if (mine === seq.current) { setHits(got); setLookupFailed(false); }
      } catch {
        // A failed lookup used to show NOTHING, which reads exactly like
        // "nothing would be affected" - the most dangerous thing it could
        // say. It now says it could not check.
        if (mine === seq.current) { setHits(null); setLookupFailed(true); }
      } finally {
        if (mine === seq.current) setCounting(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [seen, means]);

  async function save() {
    const s = seen.trim(), m = means.trim();
    if (!s || !m) { setError("Fill in both the reading and what it means."); return; }
    if (s.toUpperCase() === m.toUpperCase()) {
      setError("Those are the same, so there is nothing to correct.");
      return;
    }
    setBusy(true); setError(""); setNotice(""); setResult(null);
    try {
      const saved = await correctionService.create(
        { seen: s, means: m, note: note.trim() || null }, getToken() ?? "");
      setRows(prev => [...prev, saved.correction]
        .sort((a, b) => a.seen.localeCompare(b.seen)));
      setResult(saved.rescore);
      setSeen(""); setMeans(""); setNote(""); setHits(null);
      // The new rule changes which suggestions are already covered.
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save that correction.");
    } finally {
      setBusy(false);
    }
  }

  /** Fill the form from a suggestion. DELIBERATELY NOT a one-click save:
   *  it goes through the outcome preview like anything typed by hand. */
  function useSuggestion(s: CorrectionSuggestion) {
    setSeen(s.seen);
    setMeans(s.means);
    setNote(`Corrected by hand ${s.times} time${s.times === 1 ? "" : "s"}`
            + ` across ${s.exams} exam${s.exams === 1 ? "" : "s"}`);
    setError(""); setNotice(""); setResult(null);
  }

  async function remove(row: OCRCorrection) {
    if (!window.confirm(
      `Stop correcting "${row.seen}" to "${row.means}"?\n\n` +
      `Papers checked from now on will not have it corrected. Papers that ` +
      `were already re-checked keep the meaning they were given — the ` +
      `original reading is only on the photograph now.`)) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const out = await correctionService.remove(row.correction_id, getToken() ?? "");
      setRows(prev => prev.filter(r => r.correction_id !== row.correction_id));
      setNotice(out.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove that correction.");
    } finally {
      setBusy(false);
    }
  }

  /* The sentence beside Save. It must never be able to read as "nothing
     would happen" when the truth is "I could not find out". */
  const bits: string[] = [];
  if (hits && hits.detailed) {
    if (hits.would_be_correct) bits.push(`${hits.would_be_correct} would become correct`);
    if (hits.would_be_wrong) bits.push(`${hits.would_be_wrong} would become WRONG`);
    if (hits.would_need_review) bits.push(`${hits.would_need_review} would go to the teacher to decide`);
    if (hits.skipped_review) bits.push(`${hits.skipped_review} already under review would be left alone`);
  }

  const costsMarks = !!hits && hits.detailed && hits.would_be_wrong > 0;

  const willTouch =
    lookupFailed ? "Could not check how many papers this would affect. "
                 + "Save is still possible, but you would be doing it blind."
    : counting ? "checking…"
    : hits === null ? ""
    : hits.rows === 0 ? "No paper already checked contains that reading."
    : `Saving will re-check ${hits.rows} recorded item${hits.rows === 1 ? "" : "s"} `
      + `on ${hits.papers} paper${hits.papers === 1 ? "" : "s"}, including other teachers'.`
      + (bits.length ? ` ${bits.join("; ")}.` : "")
      + (hits.detailed ? "" : " Too many to work out the outcome item by item.");

  return (
    <section style={card}>
      <h2 style={h2}>Specimen corrections</h2>
      <p style={sub}>
        What the reader saw, and what it actually means. Every paper checked
        from now on reads these first. A blank answer and an item with more
        than one mark are never corrected.
      </p>

      {loading ? <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Loading…</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 140 }}>The reader saw</th>
              <th style={{ ...th, width: 140 }}>It means</th>
              <th style={th}>Note</th>
              <th style={{ ...th, width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={4}>
                Nothing yet. Until a correction is added, papers are checked
                exactly as they were before this list existed.
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.correction_id}>
                <td style={td}><span style={mono}>{r.seen}</span></td>
                <td style={td}><span style={mono}>{r.means}</span></td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{r.note || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button style={{ ...mini, color: "var(--danger, #b42318)" }}
                          disabled={busy}
                          onClick={() => void remove(r)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Suggested from teacher corrections ──────────────────────────
          The connection between this screen and the Test Paper screen. Every
          row here was produced by a teacher clicking an answer and fixing
          what the scanner read — Alex's "training set / dataset", collected
          by ordinary marking rather than by a labelling exercise.

          Pressing one FILLS THE FORM. It does not save. A rule created by a
          single click is a rule nobody weighed, and the outcome preview
          exists precisely because an obvious-looking correction can cost
          hundreds of marks. */}
      {sugs.length > 0 && (
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ ...h2, fontSize: "0.9rem" }}>
            Suggested from teacher corrections
          </h3>
          <p style={sub}>
            What teachers have overruled the scanner on. Choose one to fill in
            the form below — nothing is saved until you press Save.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 120 }}>The reader saw</th>
                <th style={{ ...th, width: 120 }}>Teachers said</th>
                <th style={{ ...th, width: 90 }}>Times</th>
                <th style={{ ...th, width: 110 }}>Reader was</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {sugs.map(sg => (
                <tr key={`${sg.seen}>${sg.means}`}>
                  <td style={td}><span style={mono}>{sg.seen}</span></td>
                  <td style={td}><span style={mono}>{sg.means}</span></td>
                  <td style={{ ...td, color: "var(--text-muted)" }}>
                    {sg.times}× · {sg.exams} exam{sg.exams === 1 ? "" : "s"}
                  </td>
                  {/* A CONFIDENT wrong reading is the kind a specimen row
                      fixes. An unsure one may just need a better photograph,
                      so the number is shown rather than hidden behind a
                      recommendation. */}
                  <td style={{ ...td,
                               color: sg.avg_confidence !== null && sg.avg_confidence >= 0.8
                                 ? "var(--warning, #b54708)" : "var(--text-muted)" }}>
                    {sg.avg_confidence === null ? "—"
                      : `${Math.round(sg.avg_confidence * 100)}% sure`}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {sg.already ? (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        already a rule
                      </span>
                    ) : (
                      <button style={mini} disabled={busy}
                              onClick={() => useSuggestion(sg)}>Use this</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end",
                    flexWrap: "wrap", marginTop: "1rem" }}>
        <label style={label}>
          The reader saw<br />
          <input style={{ ...input, width: 130, marginTop: "0.25rem", display: "block" }} value={seen}
                 placeholder="-"
                 onChange={e => setSeen(e.target.value)} />
        </label>
        <label style={label}>
          It means<br />
          <input style={{ ...input, width: 130, marginTop: "0.25rem", display: "block" }} value={means}
                 placeholder="E"
                 onChange={e => setMeans(e.target.value)} />
        </label>
        <label style={{ ...label, flex: "1 1 200px" }}>
          Note (optional)<br />
          <input style={{ ...input, width: "100%", marginTop: "0.25rem", display: "block" }} value={note}
                 placeholder="Handwritten E read as a dash"
                 onChange={e => setNote(e.target.value)} />
        </label>
        <button style={primary} disabled={busy || !seen.trim() || !means.trim()}
                onClick={() => void save()}>
          {busy ? "Saving…" : "Save and re-check"}
        </button>
      </div>

      {/* Red when it would cost marks. That case is not a warning, it is a
          reason to stop: a correction that marks correct answers wrong looks
          exactly like one that does not until this line says so. */}
      {willTouch && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.6rem", padding: costsMarks ? "8px 10px" : 0,
                    borderRadius: costsMarks ? 6 : 0,
                    background: costsMarks ? "var(--danger-bg, #fef3f2)" : "transparent",
                    border: costsMarks ? "1px solid var(--danger-border, #fecdca)" : "none",
                    fontWeight: costsMarks ? 600 : 400,
                    color: costsMarks ? "var(--danger, #b42318)"
                         : lookupFailed ? "var(--danger, #b42318)"
                         : hits && hits.rows > 0 ? "var(--warning, #b54708)"
                         : "var(--text-muted)" }}>
          {willTouch}
        </p>
      )}

      {/* Amber, not green, when the pass put items into review: that is an
          action for a teacher, not a result to be pleased about. */}
      {result && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.6rem",
                    color: result.marks_to_review > 0
                      ? "var(--warning, #b54708)" : "var(--success, #027a48)",
                    background: result.marks_to_review > 0
                      ? "var(--warning-bg, #fffaeb)" : "var(--success-bg, #ecfdf3)",
                    border: `1px solid ${result.marks_to_review > 0
                      ? "var(--warning-border, #fedf89)"
                      : "var(--success-border, #abefc6)"}`,
                    borderRadius: 6, padding: "8px 10px" }}>
          {result.message}
          {result.marks_to_review > 0 && (
            <><br />Those items are close to the answer but not exact, so they
            were handed to the teacher to decide rather than marked.</>
          )}
        </p>
      )}

      {notice && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.6rem", color: "var(--text-muted)",
                    background: "var(--muted-bg, #f9fafb)",
                    border: "1px solid var(--border)",
                    borderRadius: 6, padding: "8px 10px" }}>
          {notice}
        </p>
      )}

      {error && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.6rem", color: "var(--danger, #b42318)" }}>{error}</p>
      )}

      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.85rem" }}>
        For a true or false item, write the whole word — <span style={mono}>TRUE</span>,
        not <span style={mono}>T</span>. That is the form a recorded answer is
        stored in, so a correction written as a single letter will not find it.
        For an identification item, a correction that makes the reading match
        the answer exactly marks it correct; one that only gets it closer hands
        it to the teacher to decide.
      </p>
    </section>
  );
}