/**
 * lib/analyticsLink.ts
 * ====================
 * NEW 2026-11-23 — Ms. Melanie, Recommendations page 18, requirement 7a: a
 * "Data Analytics" option on View Exam that opens the analytics for THAT
 * exam, without asking the teacher to pick it again from a dialog.
 *
 * ONE QUERY PARAMETER, `?exam=`, and the three functions that read and write
 * it live here so the link and the reader cannot disagree about its name —
 * the same arrangement as lib/classListReturn.ts, which exists because the
 * "Back to List of Students" link and its reader had drifted.
 *
 * WHY A QUERY PARAMETER AND NOT SESSION STORAGE. Storage would survive the
 * trip, but it would also survive every OTHER arrival at /analytics: a
 * teacher clicking Data Analytics in the sidebar a week later would land on
 * whatever exam they last viewed, with no picker and no clue why. The
 * parameter is only present on the link that meant it.
 *
 * `readParam` is borrowed from lib/classListReturn.ts rather than copied. It
 * is a strict positive-integer reader — it rejects "1.5", " 1 " and "1e3" —
 * and a second copy of that is a second place for the strictness to be
 * relaxed by accident.
 */
import { readParam } from "@/lib/classListReturn";

export const EXAM_PARAM = "exam";

/** Where View Exam's "Data Analytics" button points. */
export function analyticsHref(examId: number): string {
  return examId > 0 ? `/analytics?${EXAM_PARAM}=${examId}` : "/analytics";
}

/** The exam named in the URL, or null when there is none or it is junk. */
export function examFromSearch(search: string | null | undefined): number | null {
  return readParam(search, EXAM_PARAM);
}

/** Where the back button points.
 *
 *  `deepLinked` is the exam this page was OPENED with and `shown` is the exam
 *  currently on screen. They differ once the teacher changes exam from the
 *  picker, and at that moment "back to the exam" would send them to a screen
 *  they are no longer looking at — so it reverts to Manage Exams. */
export function backHref(deepLinked: number | null, shown: number | null): string {
  return deepLinked !== null && deepLinked === shown ? `/exams/${deepLinked}` : "/exams";
}