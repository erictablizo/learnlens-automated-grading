/**
 * lib/classListReturn.ts
 * ======================
 * NEW 2026-11-22 — Sir Alex Passion, Recommendations page 15.
 *
 *   "After clicking this 'Back to List of Students', can it go back to the
 *    previous screen accessed:  [the roster]
 *    Not this screen:           [the empty Select Option picker]"
 *
 * WHAT IS ACTUALLY WRONG. `class-lists/page.tsx` keeps the chosen list in
 * component state (`active`) and renders ClassListPickerModal whenever that
 * state is null. Opening a student record unmounts the page; coming back
 * mounts it again with `active` null, so the picker reappears — and empty,
 * because the <select> starts at "Select a subject and schedule…". Nothing
 * is broken; the screen simply has no memory.
 *
 * WHY A QUERY PARAMETER AND NOT sessionStorage. Storage would remember the
 * list for EVERY arrival at /class-lists, including clicking "List of
 * Students" in the sidebar — and page 7 says that click must raise the
 * picker. The query parameter restores the list on exactly one journey, the
 * one Alex named, and leaves every other way in alone.
 *
 * WHY THESE ARE PURE FUNCTIONS IN A MODULE OF THEIR OWN. Two screens have to
 * agree about one parameter name. Spelled out in both, they agree until
 * someone edits one of them. The bench
 * measure/2026-11-22_class_list_return.mjs runs these.
 *
 * WHY NOT useSearchParams(). In the App Router it forces the page into a
 * Suspense boundary at prerender and fails the build if there is not one.
 * These pages are already "use client" and already read their data in an
 * effect, so they can hand `window.location.search` to readParam() there and
 * the build stays as it is. That matters on a 1.9 GB box where the frontend
 * build is the step most likely to be skipped.
 */

/** The parameter the roster hands to the student record. */
export const FROM_PARAM = "from";
/** The parameter the student record hands back to the roster. */
export const LIST_PARAM = "list";

/** One positive integer out of a query string, or null.
 *
 *  Null for everything else, deliberately — absent, blank, "abc", "0", "-3",
 *  "1.5", "12x". A parameter a teacher can edit in the address bar is
 *  untrusted input, and the caller's fallback (show the picker) is a correct
 *  answer for all of it. */
export function readParam(search: string | null | undefined, name: string): number | null {
  if (!search) return null;
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get(name);
  if (raw === null || raw.trim() === "") return null;
  // CORRECTED 2026-11-23: this comment used to claim " 1 " was rejected too.
  // It is not — the test runs on `raw.trim()`, so surrounding whitespace is
  // accepted and " 1 " reads as 1. That is the behaviour wanted (a
  // hand-edited URL with a stray space still names list 1); the comment was
  // simply describing code that was never written. Found by
  // measure/2026-11-23_analytics_link.mjs, which reuses this reader.
  if (!/^\d+$/.test(raw.trim())) return null;         // not Number(): "1.5", "1e3", "12x"
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Where a row in the roster points.
 *  `fromListId` null means "we do not know which list this was opened from",
 *  and the link is written without the parameter rather than with a junk one. */
export function studentHref(studentId: number, fromListId: number | null): string {
  const base = `/class-lists/student/${studentId}`;
  return fromListId && fromListId > 0 ? `${base}?${FROM_PARAM}=${fromListId}` : base;
}

/** Where "← Back to List of Students" points.
 *  With no list to go back to it points at /class-lists plain, which raises
 *  the picker — the behaviour Alex is complaining about, kept deliberately
 *  for the one case where it is the only honest answer: a student record
 *  opened from a bookmark, a reload of a stripped URL, or a typed address. */
export function backToListHref(fromListId: number | null): string {
  return fromListId && fromListId > 0
    ? `/class-lists?${LIST_PARAM}=${fromListId}`
    : "/class-lists";
}

/** The list the roster should open with, out of the ones it loaded.
 *
 *  Returns null when the id names no list this teacher has — a deleted list,
 *  or another teacher's id typed into the address bar. The caller then shows
 *  the picker, which is both the safe answer and the truthful one. */
export function pickList<T extends { class_list_id: number }>(
  id: number | null,
  lists: readonly T[],
): T | null {
  if (id === null) return null;
  return lists.find(l => l.class_list_id === id) ?? null;
}