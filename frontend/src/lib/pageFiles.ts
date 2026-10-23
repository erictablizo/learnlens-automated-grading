/**
 * NEW 2026-10-23 — picking SEVERAL page images in one go.
 *
 * Doc Rubrica, fifth comment: she questioned why "+ Add page" and the Pages
 * dropdown exist at all, when she can select every answer sheet at once in
 * File Explorer. Until now every file input in the app read
 * `e.target.files?.[0]` — one file per dialog, six places — so the page rows
 * had to be created by hand before anything could be uploaded into them.
 *
 * This module holds the rules for spreading a multi-file selection across page
 * rows. The four screens (Create Exam, Edit Exam, Add Paper, Edit Paper) each
 * keep their own row type, so they call planPageFiles() and then apply the
 * plan to their own state. That way the ORDERING, the CAP and the IMAGE CHECK
 * are decided in one place and cannot drift apart again.
 *
 *     Save as: frontend/src/lib/pageFiles.ts
 */

/** Same extensions the four screens already accepted individually. */
const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;

export function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
}

/**
 * Sort by filename the way a person reads it.
 *
 * `e.target.files` arrives in whatever order the browser hands over, which is
 * NOT guaranteed to be the order shown in the file dialog. A plain string sort
 * is also wrong — it puts "page_10" before "page_2". `numeric: true` compares
 * the digit runs as numbers, so 01_Student … 30_Student and page_1 … page_10
 * both land in the order the teacher expects.
 */
export function sortByName(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

export interface PageFilePlan {
  /** row index -> the file that belongs in it, in reading order */
  assign: { index: number; file: File }[];
  /** how many rows must be created beyond the ones that exist now */
  newRows: number;
  /** how many rows there should be once the plan is applied */
  totalRows: number;
  /** null when everything fitted and every file was an image */
  message: string | null;
}

/**
 * Work out where a multi-file selection should land.
 *
 * `startIndex` is the row whose button was clicked: picking three files on
 * page 2 fills pages 2, 3 and 4, creating 3 and 4 if they do not exist. One
 * file behaves exactly as before, so nothing changes for a single-page exam.
 */
export function planPageFiles(opts: {
  files: FileList | File[] | null | undefined;
  startIndex: number;
  currentRows: number;
  maxRows: number;
}): PageFilePlan {
  const { startIndex, currentRows, maxRows } = opts;
  const picked = opts.files ? Array.from(opts.files) : [];
  const empty: PageFilePlan = { assign: [], newRows: 0, totalRows: currentRows, message: null };
  if (picked.length === 0) return empty;

  const images = sortByName(picked.filter(isImageFile));
  const rejected = picked.filter(f => !isImageFile(f));

  // How many rows are available from startIndex to the cap.
  const capacity = Math.max(0, maxRows - startIndex);
  const taken = images.slice(0, capacity);
  const overflow = images.length - taken.length;

  const notes: string[] = [];
  if (rejected.length) {
    const names = rejected.slice(0, 3).map(f => f.name).join(", ");
    notes.push(
      rejected.length === 1
        ? `"${names}" is not an image and was ignored.`
        : `${rejected.length} file(s) were not images and were ignored: ${names}${rejected.length > 3 ? "…" : ""}`,
    );
  }
  if (overflow > 0) {
    notes.push(`Only ${maxRows} page(s) are allowed, so ${overflow} file(s) were ignored.`);
  }

  const lastIndex = startIndex + taken.length - 1;
  return {
    assign: taken.map((file, i) => ({ index: startIndex + i, file })),
    newRows: Math.max(0, lastIndex + 1 - currentRows),
    totalRows: Math.max(currentRows, lastIndex + 1),
    message: notes.length ? notes.join(" ") : null,
  };
}