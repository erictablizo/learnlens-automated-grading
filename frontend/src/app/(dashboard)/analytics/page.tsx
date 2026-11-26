"use client";
/**
 * NEW 2026-11-11 — Data Analytics.
 *
 * Doc Rubrica, post-UAT recommendations, page 1, verbatim:
 *
 *   Data Analytics - separate clickable option in the side bar
 *   Choose Subject, Schedule and Exam Name (3 Details needed)
 *   No of Students that got highest score and list the details of Student and its score
 *   No of Students that who passed the exam and list the details of Student and its score
 *   No of Students that who failed the exam and list the details of Student and its score
 *   No of Students that got zero score and list the details of Student and its score
 *   Provide also info of number that students did not get the correct answer
 *
 * A SEPARATE PAGE, not a band on the Summary Report. Her first line says
 * "separate clickable option in the side bar" and the sidebar entry is in
 * components/ui/Navbar.tsx.
 *
 * Each of the four categories shows a COUNT and the STUDENTS, because
 * "and list the details of Student and its score" is half of every one of
 * those lines.
 *
 * TWO SOURCES:
 *   GET /exams/{id}/papers     — existing. Drives the four student lists.
 *   GET /exams/{id}/analytics  — NEW. Drives the per-item table only; nothing
 *                                else exposes per-item results in bulk.
 *
 * CHANGED 2026-11-15 (Grace, post-UAT) — the per-item table was headed
 * "Items students got wrong" and listed EVERY item, including the ones nobody
 * missed. Sixty rows of mostly zeroes is a table a teacher scrolls past. It
 * now shows only the items the MAJORITY missed. See MAJORITY_* below.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import ExamPicker from "@/components/reports/ExamPicker";
import { examService } from "@/services/examService";
import { paperService } from "@/services/paperService";
import { analyticsService } from "@/services/analyticsService";
import { Exam } from "@/types/exam";
import { Paper } from "@/types/paper";
import { ExamAnalytics } from "@/types/analytics";
import { getToken, isAuthenticated } from "@/lib/auth";
import { bySurname, paperLastName, paperFirstName } from "@/lib/textField";
// NEW 2026-11-23 - Ms. Melanie, Recommendations page 18, requirements 7a and 9.
import { examFromSearch, backHref } from "@/lib/analyticsLink";
import { DEFAULT_PASSING_MARK, clampMark, passingScore } from "@/lib/passing";
// NEW 2026-11-26 — Ms. Melanie, page 21 requirement 3: the same export
// the exam page offers, launched from here with the mark typed below.
import { downloadAnalyticsXlsx, downloadErrorMessage } from "@/services/exportService";
import { summariseScores, asRows } from "@/lib/scoreStats";
// NEW 2026-11-24 - requirement 9's Mode, as Ms. Melanie defines it.
import { itemExtremes, itemModeLines } from "@/lib/itemExtremes";

/** NEW 2026-11-24 — "6 checked paper(s)" on a screen Ms. Melanie asked to
 *  make user-friendly (requirement 1). Local to this page because all
 *  three "(s)" sites are in this file. */
const plural = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);

/**
 * The passing mark, as a PERCENTAGE of the exam's item count.
 *
 * Her lines 4 and 5 ask for "passed" and "failed" and do not say what passing
 * is. It is a CONTROL rather than a constant: a wrong guess would put a wrong
 * number on a report she signs, and "what counts as passing?" is the first
 * thing a panellist asks. With the control on screen, the answer is on screen
 * too.
 *
 * CHANGED 2026-11-17 (Grace): 75 → 60. 75 was a guess at the common
 * Philippine mark; 60 is what this school actually passes at. Only the
 * STARTING value moves — the control itself is untouched, so a teacher can
 * still type any mark for one exam.
 *
 * Math.ceil, not round, so the boundary never drifts BELOW the percentage
 * typed: 60% of 15 items is 9.0 and the mark is 9; 60% of 16 is 9.6 and the
 * mark is 10.
 *
 * CHANGED 2026-11-23 - the number and the ceil are now lib/passing.ts, which
 * Student Record also calls (Melanie page 18 requirement 6). They are not
 * repeated there. The two screens showed the same student passing on one and
 * failing on the other for one afternoon, because passing.ts was written with
 * Math.round: 60% of 17 is 10.2, and that is 11 here and was 10 there. One
 * function now, so that cannot recur.
 */
const DEFAULT_PASS_PERCENT = DEFAULT_PASSING_MARK;

/**
 * NEW 2026-11-15 (Grace, post-UAT):
 *
 *   "Instead of Items students got wrong, it should be: Items incorrectly
 *    answered by the majority of the class. => more than 50% of the
 *    population of the Class got wrong answer in this item."
 *
 * STRICTLY MORE THAN HALF. `wrong * 2 > answered`, not `>=`, and not a float
 * comparison: 2 of 4 is not a majority, and integer arithmetic cannot drift
 * the way `wrong / answered > 0.5` can at the boundary.
 *
 * THE DENOMINATOR IS `answered` — the papers that actually have a result for
 * THAT item — and this is the one judgement call in the change, so it is
 * written down rather than buried.
 *
 *   `papers_total` would count papers that have not been graded at all. They
 *   contribute nothing to `wrong`, so an item every graded student missed
 *   would be diluted below half by papers nobody has checked yet, and the
 *   table would stay empty while the teacher stares at a class that plainly
 *   failed it.
 *
 *   `answered` cannot do that. Its weakness is the opposite one: with 3 of 40
 *   papers graded, "the majority" means the majority of three. That is why
 *   the row PRINTS its own denominator — "3 of 3 (100%)" — and why the
 *   not-included banner above the table stays.
 *
 * `wrong` ALREADY INCLUDES BLANKS. analytics_service counts `wrong` as
 * `is_correct = False` and `blank` as a subset of it; this page has said so
 * in its own footnote since 2026-11-11. So "got wrong answer" and Doc
 * Rubrica's "did not get the correct answer" are the same number, and no
 * subtraction is needed to honour either sentence.
 *
 * Items still UNDER REVIEW are in neither `wrong` nor `correct`, so they
 * cannot push an item over the line. An item can therefore cross the
 * threshold later, once those decisions are made — which is correct, and the
 * footnote says it.
 */
const isMajorityWrong = (it: { wrong: number; answered: number }): boolean =>
  it.answered > 0 && it.wrong * 2 > it.answered;

/**
 * The percentage, to ONE DECIMAL where it needs one.
 *
 * NOT Math.round to a whole number, and this was found by the bench rather
 * than by reading. With 101 papers the smallest majority is 51, and
 * `Math.round(51 / 101 * 100)` is **50** — so a row would have printed
 * "51 of 101 (50%)" directly under a heading promising MORE than 50%. A
 * table that appears to contradict its own heading is worse than one with no
 * percentage at all.
 *
 * One decimal fixes it for every class size this system can hold: the
 * smallest majority of n is floor(n/2)+1, which is at least 50 + 50/n
 * percent, and that only rounds back down to 50.0 once n exceeds 1000.
 * MAX_BULK_ROWS and the per-exam paper count are both far below that.
 */
const wrongPercent = (wrong: number, answered: number): string => {
  const p = Math.round((wrong / answered) * 1000) / 10;
  return `${p}%`;
};

/** Highest first; alphabetical within a tie so the order is never arbitrary. */
const byScoreDesc = (a: Paper, b: Paper): number => {
  const sa = a.total_score ?? -1;
  const sb = b.total_score ?? -1;
  if (sa !== sb) return sb - sa;
  return bySurname(a, b);
};

interface Category {
  key:      string;
  label:    string;
  students: Paper[];
  note:     string;
}

// CHANGED 2026-11-20 — `outOf` rather than `totalItems`: since Alex's page 12
// the denominator is a sum of POINTS, and a prop called totalItems holding a
// points total is how a screen starts lying quietly.
function CategoryBlock({ cat, outOf }: { cat: Category; outOf: number }) {
  return (
    <section
      aria-label={cat.label}
      style={{
        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
        background: "var(--surface)", padding: "0.9rem 1rem", marginBottom: "0.9rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--navy)", lineHeight: 1 }}>
          {cat.students.length}
        </span>
        <span style={{ fontWeight: 600, color: "var(--navy)" }}>{cat.label}</span>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{cat.note}</span>
      </div>

      {cat.students.length === 0 ? (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>None.</p>
      ) : (
        <div className="table-wrapper">
          <table aria-label={`Students — ${cat.label}`}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Last Name</th>
                <th>First Name</th>
                <th style={{ width: 100 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {cat.students.map((p, i) => (
                <tr key={p.paper_id}>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{i + 1}</td>
                  <td style={{ color: "var(--navy)", fontWeight: 500 }}>{paperLastName(p) || "—"}</td>
                  <td style={{ color: "var(--navy)", fontWeight: 500 }}>{paperFirstName(p) || "—"}</td>
                  <td style={{ fontWeight: 700, color: "var(--navy)" }}>
                    {/* "Plus reflect the score with the total number of items.
                        Example: instead 14 - reflect as 14/15" — Alex, page 2. */}
                    {p.total_score}{outOf > 0 && ` / ${outOf}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DataAnalyticsPage() {
  const router = useRouter();

  const [exams,   setExams]   = useState<Exam[]>([]);
  const [exam,    setExam]    = useState<Exam | null>(null);
  const [papers,  setPapers]  = useState<Paper[]>([]);
  const [items,   setItems]   = useState<ExamAnalytics | null>(null);

  const [loading,     setLoading]     = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [passPercent, setPassPercent] = useState<number>(DEFAULT_PASS_PERCENT);
  // NEW 2026-11-26 — page 21 requirement 3.
  const [downloading, setDownloading] = useState(false);

  /* NEW 2026-11-23 - Melanie req 7a. `deepLinked` is the exam named in the
   * URL by View Exam's Data Analytics button; `pending` is that exam waiting
   * to be loaded once the exam list has arrived.
   *
   * Read from window.location.search in an effect rather than with
   * useSearchParams(), which in the App Router forces this page into a
   * Suspense boundary at prerender and fails the build without one - the same
   * reason, and the same note, as the Student Record page on 22 November. */
  const [deepLinked, setDeepLinked] = useState<number | null>(null);
  const [pending,    setPending]    = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    const load = async () => {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      setLoading(true);
      try {
        const list = await examService.list(token);
        setExams(list);
        /* NEW 2026-11-23 - Melanie req 7a: "it will go directly to the
         * analytics of this exam", so no picker when the URL names one.
         *
         * The exam must be IN THIS TEACHER'S LIST. A pasted or stale link can
         * name an exam that was deleted, or one belonging to somebody else;
         * loading it would show an error where a picker would have shown a
         * way forward. An unknown id therefore falls back to the picker,
         * which is what arriving from the sidebar does anyway. */
        const wanted = examFromSearch(window.location.search);
        setDeepLinked(wanted);
        if (wanted !== null && list.some(e => e.exam_id === wanted)) setPending(wanted);
        else setPickerOpen(true);
      } catch {
        setError("Could not load your exams.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const loadAnalytics = useCallback(async (id: number) => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setPickerOpen(false);
    setLoadingData(true);
    setError(null);
    try {
      const [detail, rows, stats] = await Promise.all([
        examService.get(id, token),
        paperService.list(id, token),
        analyticsService.get(id, token),
      ]);
      setExam(detail);
      setPapers(rows);
      setItems(stats);
    } catch {
      setError("Could not load the analytics for this exam.");
      setExam(null); setPapers([]); setItems(null);
    } finally {
      setLoadingData(false);
    }
  }, [router]);

  /* NEW 2026-11-23 - Melanie req 7a. A separate effect rather than a call
   * inside the one above, so `loadAnalytics` can be an honest dependency:
   * the exam list load does not re-run when it changes. `pending` is cleared
   * before the load starts, so this fires exactly once per deep link. */
  useEffect(() => {
    if (pending === null) return;
    const id = pending;
    setPending(null);
    void loadAnalytics(id);
  }, [pending, loadAnalytics]);

  // `totalItems` is still the ITEM COUNT, for the "Items:" figure in the
  // header. Everything that is a MARK is measured against totalPoints.
  const totalItems  = exam?.answer_keys?.length ?? 0;
  const totalPoints = exam?.answer_keys?.reduce((n, k) => n + (k.points ?? 1), 0) ?? 0;
  const passMark    = passingScore(totalPoints, passPercent);

  /**
   * Only CHECKED papers are counted.
   *
   * A paper with identification items still under review has a total_score,
   * but that number is a FLOOR, not a result. Listing such a student under
   * "failed" would be a false statement about them, printed on a report Doc
   * Rubrica signs. Excluded here, and said out loud below.
   */
  const final = useMemo(
    () => papers.filter(p => p.checked && p.total_score !== null && p.total_score !== undefined),
    [papers],
  );
  const excluded = papers.length - final.length;

  /**
   * NEW 2026-11-15. The items more than half the class got wrong, and how
   * many items are therefore NOT shown.
   *
   * `hidden` exists because a table that silently omits rows is a table a
   * reader cannot trust. "48 other items" is the sentence that turns an empty
   * table from "something is broken" into "nothing to report".
   */
  const majority = useMemo(
    () => (items?.items ?? []).filter(isMajorityWrong),
    [items],
  );
  const hidden = (items?.items.length ?? 0) - majority.length;

  /* NEW 2026-11-23 - Ms. Melanie, page 18 requirement 9. Her words:
   *
   *   "Additional Info in Data Analytics:
   *    Mean : average score ng lahat; Mode: average kung saan item ang
   *    pinaka nagkamali lahat at naging tama lahat; Median
   *
   *      Statistics (Measure) | Value
   *      Mean                 |
   *      Median               |
   *      Mode                 |"
   *
   * CORRECTED 2026-11-24. The position - above the highest-score table - is
   * from the red arrow on her screenshot and is right. The sentence this
   * used to quote was not hers. Her gloss defines Mode as being about an
   * ITEM rather than a score; see lib/scoreStats.ts, where that is written
   * out. OPEN QUESTION.
   *
   * COMPUTED FROM `final`, THE SAME ARRAY THE FOUR TABLES BELOW USE. That is
   * the whole point: the mean sits directly above a list of students, and if
   * it were fetched from an endpoint that re-derived "which papers count" it
   * could describe a different set of students than the list under it. See
   * lib/scoreStats.ts, and app/ml/statistics.py, which is its twin for the
   * day the Excel export needs the same three numbers. */
  const stats = useMemo(
    () => summariseScores(final.map(p => p.total_score), totalPoints > 0 ? totalPoints : null),
    [final, totalPoints],
  );

  /* NEW 2026-11-24 - the Mode row, from her own definition: "average kung
   * saan item ang pinaka nagkamali lahat at naging tama lahat".
   *
   * From `items`, NOT from `final`. The other two rows are score statistics
   * over the checked papers; this one is about questions, and it reads the
   * same per-item counts the table at the foot of this page uses - so the
   * item it names is the same item that table shows. */
  const modeLines = useMemo(
    () => itemModeLines(itemExtremes(items?.items)),
    [items],
  );

  const categories: Category[] = useMemo(() => {
    const scores = final.map(p => p.total_score as number);
    const highestScore = scores.length > 0 ? Math.max(...scores) : null;
    const sortDesc = (list: Paper[]) => list.slice().sort(byScoreDesc);

    return [
      {
        key: "highest",
        label: "got the highest score",
        students: highestScore === null ? [] : sortDesc(final.filter(p => p.total_score === highestScore)),
        note: highestScore === null
          ? "no checked papers yet"
          : `the highest anyone scored is ${highestScore}${totalPoints > 0 ? ` / ${totalPoints}` : ""}`,
      },
      {
        key: "passed",
        label: "passed",
        students: totalPoints === 0 ? [] : sortDesc(final.filter(p => (p.total_score as number) >= passMark)),
        note: totalPoints === 0 ? "no answer key yet" : `scored ${passMark} / ${totalPoints} or more`,
      },
      {
        key: "failed",
        label: "failed",
        students: totalPoints === 0 ? [] : sortDesc(final.filter(p => (p.total_score as number) < passMark)),
        note: totalPoints === 0 ? "no answer key yet" : `scored below ${passMark} / ${totalPoints}`,
      },
      {
        key: "zero",
        label: "scored zero",
        students: sortDesc(final.filter(p => p.total_score === 0)),
        // Said plainly because the four numbers do NOT add up to the class
        // size, and a reader who assumes they do will think something is wrong.
        note: "also counted under “failed”",
      },
    ];
  }, [final, passMark, totalPoints]);

  if (loading) {
    return (
      <div className="dashboard-layout">
        <Navbar />
        <main className="main-content" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="spinner spinner-dark" />
          <span style={{ color: "var(--text-muted)" }}>Loading exams…</span>
        </main>
      </div>
    );
  }

  /* NEW 2026-11-26 — Ms. Melanie, page 21 requirement 3.

     `finally`, not the end of `try`: a failed download must clear the
     flag too, or the button stays disabled reading "Preparing…" with
     no way back but a reload. The same shape as the exam page's
     handler, and for the same reason its comment gives.

     passPercent, NOT the default. The teacher is looking at a number
     in the box above and at tables computed from it; a workbook that
     used a different one would be wrong in a way nobody would spot. */
  const handleDownloadExcel = async () => {
    if (!exam) return;
    setError(null);
    setDownloading(true);
    try {
      // CHANGED 2026-11-26 — page 22 requirement 3: the
      // analytics workbook, not the exam-results one.
      await downloadAnalyticsXlsx(exam.exam_id, passPercent);
    } catch (e) {
      setError(downloadErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Data Analytics</h1>
          {/* NEW 2026-11-26 — page 21 requirement 3. In the gap she
              circled, left of Change exam, and in a row with it so the
              two stay together at any width. */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Button
              variant="secondary"
              onClick={handleDownloadExcel}
              loading={downloading}
              /* Nothing to export before an exam is chosen, and the
                 handler returns early anyway - this only means the
                 button never looks available when it is not. */
              disabled={!exam || downloading}
              style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}
            >
              {downloading ? "Preparing…" : "Download Data Analytics to Excel"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPickerOpen(true)}
              style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}
            >
              {exam ? "Change exam" : "Choose exam"}
            </Button>
          </div>
        </div>

        {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

        {loadingData && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 0" }}>
            <span className="spinner spinner-dark" />
            <span style={{ color: "var(--text-muted)" }}>Loading analytics…</span>
          </div>
        )}

        {!exam && !loadingData && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {/* CHANGED 2026-11-23 - Melanie req 7b: "Section" replaces
                "Schedule" on this screen. */}
            Choose a subject, a section and an exam to see its analytics.
          </p>
        )}

        {exam && !loadingData && (
          <>
            <div style={{
              display: "flex", flexWrap: "wrap", justifyContent: "space-between",
              alignItems: "center", gap: "0.6rem 2rem", marginBottom: "1rem", fontSize: "0.85rem",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 2rem" }}>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>Exam: </span>
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.exam_name}</span>
                </span>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>Subject: </span>
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.subject ?? "—"}</span>
                </span>
                <span>
                  {/* CHANGED 2026-11-23 - Ms. Melanie, page 18 requirement 8:
                      "Section" instead of "Schedule" in the details shown
                      after Show.

                      THE LABEL CHANGES; THE FIELD DOES NOT, YET. `exam.schedule`
                      is still the column, still the API field and still what
                      Create Exam sends. Renaming it here alone would print an
                      empty Section on every exam. The column rename is one
                      migration plus about a dozen files and it lands as a
                      SINGLE push - see PAGE18-MELANIE-2026-11-23.md. */}
                  <span style={{ color: "var(--text-muted)" }}>Section: </span>
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>{exam.schedule ?? "—"}</span>
                </span>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>Students: </span>
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>{papers.length}</span>
                </span>
                {totalItems > 0 && (
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>Items: </span>
                    <span style={{ color: "var(--navy)", fontWeight: 600 }}>{totalItems}</span>
                  </span>
                )}
              </div>

              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem"}}>
                Passing mark
                <input
                  type="number" min={1} max={100} value={passPercent}
                  onChange={e => setPassPercent(clampMark(Number(e.target.value)))}
                  aria-label="Passing mark, percent"
                  style={{ width: 64, padding: "0.25rem 0.4rem", fontSize: "0.8rem" }}
                />
                %
                {totalPoints > 0 && <span>= {passMark} / {totalPoints}</span>}
              </label>
            </div>

            {excluded > 0 && (
              <div role="status" style={{
                marginBottom: "1rem", padding: "0.6rem 0.8rem", fontSize: "0.8rem", lineHeight: 1.5,
                color: "var(--navy)", background: "var(--orange-light)",
                border: "1px solid var(--orange)", borderRadius: "var(--radius-sm)",
              }}>
                {excluded} of {papers.length} {plural(papers.length, "paper")}{" "}
                {plural(excluded, "is", "are")} not included below: {plural(excluded,
                "it is", "they are")} not graded yet, or still {plural(excluded, "has",
                "have")} items waiting for your decision, so {plural(excluded,
                "its score is a minimum", "their scores are minimums")} rather than a
                result.
              </div>
            )}

            {/* NEW 2026-11-23 - Melanie req 9: "Insert 'Mean, Median and
                Mode' BEFORE the highest score table". Her two column
                headings, word for word. */}
            <section aria-label="Statistics" style={{
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              background: "var(--surface)", padding: "0.9rem 1rem", marginBottom: "0.9rem",
            }}>
              <div className="table-wrapper">
                <table aria-label="Mean, median and mode">
                  <thead>
                    <tr>
                      <th style={{ width: 220 }}>Statistics (Measure)</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asRows(stats, "\u2014", modeLines).map(r => {
                      const lines = Array.isArray(r.value) ? r.value : [r.value];
                      const empty = lines.length === 1 && lines[0] === "\u2014";
                      return (
                        <tr key={r.measure}>
                          <td style={{ color: "var(--navy)", fontWeight: 600 }}>{r.measure}</td>
                          <td style={{
                            color: empty ? "var(--text-muted)" : "var(--navy)",
                            fontWeight: empty ? 400 : 700,
                          }}>
                            {/* Mode is TWO lines - the item most got wrong and
                                the item most got right. One joined string
                                reads as a single sentence and the two item
                                numbers run together. */}
                            {lines.map((t, i) => (
                              <div key={i} style={{ fontWeight: lines.length > 1 ? 600 : undefined,
                                                    fontSize: lines.length > 1 ? "0.82rem" : undefined }}>
                                {t}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "0.74rem", color: "var(--text-muted)",
                          marginTop: "0.6rem", lineHeight: 1.6 }}>
                {stats.count === 0
                  ? "No paper in this exam has been checked yet, so there is nothing to average."
                  /* CORRECTED 2026-11-24, from a screenshot of learnlens.tech.
                     This clause was UNCONDITIONAL and said "one", so on an exam
                     with nothing under review it printed a false statement: the
                     live page showed "Over the 6 checked paper(s) ... one still
                     waiting for your decision ... is not averaged" while all six
                     were averaged (mean 54.5 = 327/6, median 59.5, both over all
                     six). `excluded` was already computed on line 316 and already
                     drives the banner above; it just never reached this sentence.
                     The two clauses also contradicted each other outright. */
                  : <>Over the {stats.count} checked {plural(stats.count, "paper")}
                     {stats.outOf ? <>, out of {stats.outOf} points</> : null}. The same
                     papers as the tables below
                     {excluded > 0
                       ? <>: {excluded} more {plural(excluded, "is", "are")} still waiting
                         for your decision, so {plural(excluded, "its score is a minimum",
                         "their scores are minimums")} rather than a result and
                         {plural(excluded, " it is", " they are")} not averaged.</>
                       : <>.</>}
                     {" Mode names the ITEM the class got wrong most and the " +
                      "item they got right most, which is how requirement 9 " +
                      "defines it; it is counted over every graded paper, not " +
                      "only the checked ones. Ties are all listed."}
                    </>}
              </p>
            </section>

            {categories.map(c => <CategoryBlock key={c.key} cat={c} outOf={totalPoints} />)}

            {/* "Provide also info of number that students did not get the
                correct answer" — Doc Rubrica's last line, per item, narrowed
                on 2026-11-15 to the items the MAJORITY missed. */}
            <section aria-label="Items most of the class got wrong" style={{
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              background: "var(--surface)", padding: "0.9rem 1rem",
            }}>
              <h2 style={{
                fontFamily: "var(--font-heading)", fontSize: "0.95rem", fontWeight: 700,
                color: "var(--navy)", margin: "0 0 0.15rem",
              }}>
                Items incorrectly answered by the majority of the class
              </h2>
              <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "0 0 0.6rem" }}>
                More than 50% of the papers counted for an item got it wrong.
              </p>

              {!items || items.items.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                  No paper in this exam has been graded yet, so there are no per-item results.
                </p>
              ) : majority.length === 0 ? (
                /* NOT an error, and it must not read like one. Every item was
                   answered correctly by at least half the class, which is the
                   good outcome - so it says that, and says how many items it
                   looked at so the number is not mistaken for a failure to
                   load. */
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                  No item was missed by more than half the class. All{" "}
                  {items.items.length} {plural(items.items.length, "item")}{" "}
                  {plural(items.items.length, "was", "were")} answered correctly by
                  at least half of the papers counted.
                </p>
              ) : (
                <>
                  <div className="table-wrapper">
                    <table aria-label="Items most of the class got wrong">
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>Item</th>
                          <th style={{ width: 90 }}>Answer</th>
                          <th style={{ width: 150 }}>Got it wrong</th>
                          <th style={{ width: 80 }}>Correct</th>
                          <th style={{ width: 90 }}>Blank</th>
                          <th style={{ width: 110 }}>Under review</th>
                        </tr>
                      </thead>
                      <tbody>
                        {majority.map(it => (
                          <tr key={it.question_number}>
                            <td style={{ color: "var(--navy)", fontWeight: 600 }}>{it.question_number}</td>
                            <td style={{ color: "var(--navy)" }}>
                              {it.correct_answer || "—"}
                              {it.key_mismatch && (
                                <span
                                  title="Some papers were graded against a different answer key for this item. Re-check this exam."
                                  style={{ color: "var(--orange)", marginLeft: "0.3rem", fontWeight: 700 }}
                                >⚠</span>
                              )}
                            </td>
                            {/* The DENOMINATOR IS PRINTED. "3 of 3 (100%)" is a
                                claim a reader can check; a bare "3" next to a
                                heading that says "majority" is one they cannot. */}
                            <td style={{ fontWeight: 700, color: "var(--orange)" }}>
                              {it.wrong} of {it.answered}{" "}
                              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                                ({wrongPercent(it.wrong, it.answered)})
                              </span>
                            </td>
                            <td style={{ color: "var(--navy)" }}>{it.correct}</td>
                            <td style={{ color: "var(--text-muted)" }}>{it.blank}</td>
                            <td style={{ color: it.review > 0 ? "var(--orange)" : "var(--text-muted)" }}>
                              {it.review}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.6rem", lineHeight: 1.6 }}>
                    {majority.length} of {items.items.length}{" "}
                    {plural(items.items.length, "item")} shown.
                    {hidden > 0 && ` The other ${hidden} were answered correctly by at least half of the papers counted.`}
                    {" "}Counted over the {items.papers_checked} checked{" "}
                    {plural(items.papers_checked, "paper")} and any
                    graded-but-unconfirmed ones. <strong>Blank</strong> is part of
                    <strong> Wrong</strong>, not a separate group. An item still
                    <strong> under review</strong> counts as neither, so an item can
                    appear here later once those decisions are made.
                    {items.items.some(i => i.key_mismatch) && (
                      <> A ⚠ marks an item whose papers were graded against more than one
                      answer key — those counts are not reliable until the exam is re-checked.</>
                    )}
                  </p>
                </>
              )}
            </section>
          </>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          {/* NEW 2026-11-23 - arrived from View Exam's Data Analytics button
              (req 7a), so back goes to that exam rather than to the list. The
              same principle as Sir Alex's page 15: a back button should undo
              the click that got you here. BEYOND Melanie's wording - she asked
              for the way in, not the way out - so it is safe to drop if you
              would rather not add a behaviour nobody asked for. */}
          <Button variant="secondary"
                  onClick={() => router.push(backHref(deepLinked, exam?.exam_id ?? null))}>
            {backHref(deepLinked, exam?.exam_id ?? null) === "/exams"
              ? "← Back to Manage Exams"
              : "← Back to Exam"}
          </Button>
        </div>

        {pickerOpen && (
          <ExamPicker
            exams={exams}
            current={exam?.exam_id ?? null}
            title="Data Analytics"
            confirmLabel="Show"
            onPick={loadAnalytics}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </main>
    </div>
  );
}