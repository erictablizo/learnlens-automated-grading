"use client";
/**
 * hooks/useReferenceLists.ts
 * ==========================
 * NEW 2026-11-14 — the three dropdown lists, read from the database.
 *
 * This replaces, at the point of use, the four things the Edit Profile and
 * Setup screens import from `@/types/profile`:
 *
 *     COLLEGE_OPTIONS        ->  lists.collegeOptions
 *     COURSES_BY_COLLEGE[c]  ->  lists.coursesFor(c)
 *     yearLevelsFor(c)       ->  lists.yearLevelsFor(c)
 *     YEAR_LABELS[y]         ->  lists.yearLabel(c, y)
 *     isValidYear(c, y)      ->  lists.isValidYear(c, y)
 *
 * DELIBERATELY THE SAME SHAPES AND THE SAME NAMES. Both screens are long and
 * have been edited by six separate reviewer notes; rewriting them to fetch
 * data is a far bigger change than swapping five expressions. A hook that
 * answers the same questions the constants answered means each screen changes
 * in a handful of lines and everything around those lines is untouched.
 *
 * WHY `yearLabel` TAKES THE COLLEGE AND `YEAR_LABELS` DID NOT. The labels are
 * per college now — the migration seeds CVMAS to 6th year and everyone else to
 * 3rd, which is the rule that until today lived only in a comment and a
 * browser-side filter. A single global map cannot express "4th Year exists at
 * CVMAS and nowhere else".
 *
 * WHILE IT IS LOADING, every list is EMPTY and `loading` is true. Screens must
 * not render a dropdown with no options and no explanation — show the spinner
 * or disable the control. An empty <select> that looks ready is worse than one
 * that says it is still loading.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/auth";
import { referenceService } from "@/services/referenceService";
import type { CollegeLists } from "@/types/reference";

export interface ReferenceLists {
  loading: boolean;
  /** Set when the lists could not be fetched. The screen should say so rather
   *  than silently offering nothing — "no colleges" and "could not load the
   *  colleges" are different facts. */
  error: string | null;
  /** Same shape COLLEGE_OPTIONS had: { value, label }, in sort_order. */
  collegeOptions: { value: string; label: string }[];
  /**
   * `null | undefined` is accepted because the screens hold the college as
   * `College | ""` and call these as `coursesFor(college || null)`. Matching
   * the OLD signatures exactly is what keeps each screen a one-expression
   * swap instead of a rewrite.
   */
  coursesFor: (code: string | null | undefined) => string[];
  yearLevelsFor: (code: string | null | undefined) => number[];
  /** "3rd Year". Falls back to "Nth Year" if the level is not listed, so a
   *  profile holding a year that was later switched off still renders as
   *  words rather than as a blank. */
  yearLabel: (code: string | null | undefined, level: number) => string;
  /**
   * A TYPE GUARD, like the `isValidYear` it replaces — `year is number`, not
   * `boolean`. The screens do `setYear(y => isValidYear(c, y) ? y : "")`,
   * where `y` is `YearLevel | ""`; without the predicate that expression stops
   * narrowing and no longer compiles.
   */
  isValidYear: (code: string | null | undefined, year: unknown) => year is number;
  /** Sidebar badge colours, which used to be the hardcoded COLLEGE_COLORS map
   *  in lib/college.ts. A college an administrator added had no entry there
   *  and so rendered no badge at all. */
  badge: (code: string | null | undefined) => { bg: string; color: string } | null;
  reload: () => void;
}

export function useReferenceLists(): ReferenceLists {
  const [data,    setData]    = useState<CollegeLists[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    referenceService.lists(token)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load the lists."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Indexed once per fetch rather than scanned on every render: these helpers
  // are called inside .map() over the options, so a linear search would be
  // quadratic in the number of colleges. It is a small list today; this is
  // about not writing the shape that stops being small quietly.
  const byCode = useMemo(() => {
    const m = new Map<string, CollegeLists>();
    for (const c of data) m.set(c.code, c);
    return m;
  }, [data]);

  return useMemo<ReferenceLists>(() => ({
    loading,
    error,
    collegeOptions: data.map(c => ({ value: c.code, label: c.name })),
    coursesFor: (code) => (code ? byCode.get(code)?.courses ?? [] : []).map(x => x.name),
    yearLevelsFor: (code) => (code ? byCode.get(code)?.year_levels ?? [] : []).map(y => y.level),
    yearLabel: (code, level) =>
      (code ? byCode.get(code)?.year_levels.find(y => y.level === level)?.label : undefined)
      ?? `${level}${["th","st","nd","rd"][(level % 100 - level % 10 !== 10 && level % 10 < 4) ? level % 10 : 0]} Year`,
    isValidYear: ((code: string | null | undefined, year: unknown): year is number =>
      typeof year === "number" && Number.isInteger(year) && !!code
      && (byCode.get(code)?.year_levels ?? []).some(y => y.level === year)
    ) as ReferenceLists["isValidYear"],
    badge: (code) => {
      const c = code ? byCode.get(code) : undefined;
      return c ? { bg: c.badge_bg, color: c.badge_color } : null;
    },
    reload: load,
  }), [data, byCode, loading, error, load]);
}