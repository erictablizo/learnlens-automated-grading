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
 */
const DEFAULT_PASS_PERCENT = 60;

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

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    const load = async () => {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      setLoading(true);
      try {
        setExams(await examService.list(token));
        setPickerOpen(true);
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

  // `totalItems` is still the ITEM COUNT, for the "Items:" figure in the
  // header. Everything that is a MARK is measured against totalPoints.
  const totalItems  = exam?.answer_keys?.length ?? 0;
  const totalPoints = exam?.answer_keys?.reduce((n, k) => n + (k.points ?? 1), 0) ?? 0;
  const passMark    = totalPoints > 0 ? Math.ceil((totalPoints * passPercent) / 100) : 0;

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

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Data Analytics</h1>
          <Button
            variant="secondary"
            onClick={() => setPickerOpen(true)}
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}
          >
            {exam ? "Change exam" : "Choose exam"}
          </Button>
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
            Choose a subject, a schedule and an exam to see its analytics.
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
                  <span style={{ color: "var(--text-muted)" }}>Schedule: </span>
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
                  onChange={e => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setPassPercent(Math.min(100, Math.max(1, Math.round(n))));
                  }}
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
                {excluded} of {papers.length} paper(s) are not included below: they are not
                graded yet, or still have items waiting for your decision, so their score
                is a minimum rather than a result.
              </div>
            )}

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
                  {items.items.length} item(s) were answered correctly by at least
                  half of the papers counted.
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
                    {majority.length} of {items.items.length} item(s) shown.
                    {hidden > 0 && ` The other ${hidden} were answered correctly by at least half of the papers counted.`}
                    {" "}Counted over the {items.papers_checked} checked paper(s) and any
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
          <Button variant="secondary" onClick={() => router.push("/exams")}>← Back to Manage Exams</Button>
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