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
  AffectedCount, OCRCorrection, RescoreSummary,
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
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string>("");
  const [busy, setBusy]       = useState(false);

  const [seen, setSeen]   = useState("");
  const [means, setMeans] = useState("");
  const [note, setNote]   = useState("");

  const [hits, setHits]       = useState<AffectedCount | null>(null);
  const [counting, setCounting] = useState(false);
  const [result, setResult]   = useState<RescoreSummary | null>(null);
  const [notice, setNotice]   = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await correctionService.list(getToken() ?? ""));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the specimen list.");
    } finally {
      setLoading(false);
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
    setResult(null);
    if (!value) { setHits(null); setCounting(false); return; }
    const mine = ++seq.current;
    setCounting(true);
    const t = setTimeout(async () => {
      try {
        const got = await correctionService.affected(value, getToken() ?? "");
        if (mine === seq.current) setHits(got);
      } catch {
        if (mine === seq.current) setHits(null);
      } finally {
        if (mine === seq.current) setCounting(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [seen]);

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save that correction.");
    } finally {
      setBusy(false);
    }
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

  const willTouch =
    counting ? "counting…"
    : hits === null ? ""
    : hits.rows === 0 ? "No paper already checked contains that reading."
    : `Saving will re-check ${hits.rows} recorded item${hits.rows === 1 ? "" : "s"} ` +
      `on ${hits.papers} paper${hits.papers === 1 ? "" : "s"}, including other teachers'.`;

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

      {willTouch && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.6rem",
                    color: hits && hits.rows > 0 ? "var(--warning, #b54708)" : "var(--text-muted)" }}>
          {willTouch}
        </p>
      )}

      {result && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.6rem", color: "var(--success, #027a48)",
                    background: "var(--success-bg, #ecfdf3)",
                    border: "1px solid var(--success-border, #abefc6)",
                    borderRadius: 6, padding: "8px 10px" }}>
          {result.message}
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
      </p>
    </section>
  );
}