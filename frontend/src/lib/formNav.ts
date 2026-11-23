/**
 * lib/formNav.ts
 * ==============
 * NEW 2026-11-23 — Ms. Melanie, Recommendations page 18, requirement 3:
 *
 *   "After Clicking the + Sign, when you load 'Create Exam' automatic the
 *    cursor will position on the 1st Column of the First Input Box."
 *   "Once you enter info in the first Box and press enter key, it will go to
 *    the 1st Column of the second box. And apply the same to the succeeding
 *    input box."
 *
 * The first half is one attribute — `autoFocus` on the first input. This file
 * is the second half, and it lives here rather than in a form because three
 * forms want it: Create Exam, Set Up Profile and Edit Profile all have the
 * same column of boxes, and a handler copied into each is three handlers that
 * can drift.
 *
 * WHY NOT A <form> WITH SUBMIT. The browser already moves between fields on
 * Enter — but only inside a real <form>, only on some control types, and on
 * the last field it SUBMITS, which here would mean a page reload and a lost
 * exam. These screens are divs with a Save button and an async handler; they
 * are not forms, and turning them into forms eleven days before a defence to
 * get one keystroke is the wrong trade.
 *
 * WHAT ENTER MUST NOT DO
 * ----------------------
 * TEXTAREA  Enter is a newline there. Description is a textarea on some of
 *           these screens; stealing Enter would make it impossible to type a
 *           second line.
 * THE LAST  On the last box, Enter should do what the teacher expects - press
 * FIELD     Save - not nothing. advanceOnEnter returns false when there is
 *           nowhere to go, and the caller submits. Swallowing it would make
 *           the last box feel broken.
 * DISABLED  A disabled or hidden box is not a place a cursor can sit. The
 *           Course dropdown is disabled until a College is chosen, and
 *           landing focus on it would strand the teacher.
 * READ-ONLY Add Paper's three name boxes are read-only and filled from the
 *           roster. They are reachable by keyboard on purpose - a teacher
 *           still has to read the name - but Enter should skip PAST them,
 *           because there is nothing to type.
 */

/** The controls Enter walks between, in the order they appear on screen. */
const FOCUSABLE =
  'input:not([type="hidden"]), select, textarea';

/** True when a control can actually receive and hold a typing cursor. */
export function isAdvanceTarget(el: Element): boolean {
  const n = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (n.disabled) return false;
  // readOnly exists on input and textarea, not on select.
  if ((n as HTMLInputElement).readOnly) return false;
  if (n.getAttribute("aria-hidden") === "true") return false;
  if (n.tabIndex < 0) return false;
  // offsetParent is null for display:none and for a collapsed <details>.
  // It is ALSO null for position:fixed, which none of these forms use; if one
  // ever does, this is the line to revisit.
  if ((n as HTMLElement).offsetParent === null) return false;
  return true;
}

/** Every box Enter can land on, in DOM order.
 *
 *  `selector` narrows it. Create Exam needs that: its card also contains the
 *  file pickers for the answer-key pages, and Enter from the last text field
 *  should not land the cursor on a file input. Passing ".form-input" there
 *  keeps the walk to the four text boxes without wrapping them in a div,
 *  which would have been the alternative.
 *
 *  CORRECTED 2026-11-23, when the real globals.css arrived. This used to add
 *  "and `.create-exam-form` styles its direct children, so a new wrapper is a
 *  layout risk". It does not: `.create-exam-form` sets background, radius,
 *  padding, max-width, width, box-shadow and margin, and has no child
 *  selector at all. A wrapper div would have been harmless.
 *
 *  THE DECISION STANDS ON ITS FIRST REASON, which is the real one: Enter must
 *  not put the cursor in a file picker, and a selector says that directly
 *  where a wrapper only says it by accident of placement. The second reason
 *  was invented to support a conclusion that did not need it — which is worth
 *  more than the sentence it replaces. */
export function advanceTargets(
  root: ParentNode | null,
  selector: string = FOCUSABLE,
): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter(isAdvanceTarget);
}

/** The next box after `current`, or null when `current` is the last one or
 *  is not in this form at all. */
export function nextAdvanceTarget(
  root: ParentNode | null,
  current: Element | null,
  selector?: string,
): HTMLElement | null {
  const all = advanceTargets(root, selector);
  if (!current) return all[0] ?? null;
  const i = all.indexOf(current as HTMLElement);
  if (i < 0) return null;
  return all[i + 1] ?? null;
}

/**
 * The Enter handler. Put it on the form's wrapper, once:
 *
 *     <div ref={formRef} onKeyDown={e => {
 *       if (!advanceOnEnter(e, formRef.current)) void handleSave();
 *     }}>
 *
 * Returns TRUE when it moved the cursor and swallowed the key, FALSE when
 * Enter was not for it — a textarea, a modifier held, or the last box — so
 * the caller can decide what Enter means there. On the forms above, the last
 * box means Save.
 */
export function advanceOnEnter(
  e: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean;
       target: EventTarget | null; preventDefault: () => void },
  root: ParentNode | null,
  /** Narrows which boxes count — see advanceTargets. */
  selector?: string,
): boolean {
  if (e.key !== "Enter") return false;
  // Shift+Enter, Ctrl+Enter and friends are somebody else's shortcut.
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;

  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  // The allow-list on the third line is the real guard: TEXTAREA and BUTTON
  // both fail `tag !== "INPUT" && tag !== "SELECT"`, so the two lines above it
  // cannot currently fire. They are kept, and named, because the allow-list is
  // the line somebody will widen — and on the day INPUT|SELECT|TEXTAREA looks
  // like a reasonable widening, the textarea must still keep its Enter.
  //
  // MEASURED: removing the TEXTAREA line changes nothing (the bench stays at
  // 30/30), and widening the allow-list to include TEXTAREA breaks the
  // textarea immediately (2 fails). That is which line is load-bearing.
  if (tag === "TEXTAREA") return false;          // Enter is a newline there
  if (tag === "BUTTON") return false;            // Enter is a press there
  if (tag !== "INPUT" && tag !== "SELECT") return false;

  const next = nextAdvanceTarget(root, el, selector);
  if (!next) return false;                       // last box: let the caller act

  e.preventDefault();
  next.focus();
  // Put the cursor at the START of the box she lands in — "the 1st Column of
  // the second box", which is what she asked for. A browser focusing a text
  // input with a value in it puts the caret at the end by default, and
  // select() would highlight the text so the next keystroke wipes it.
  const asInput = next as HTMLInputElement;
  if (typeof asInput.setSelectionRange === "function") {
    try {
      asInput.setSelectionRange(0, 0);
    } catch {
      // Number and date inputs throw on setSelectionRange in some browsers.
      // The focus already landed, which is the part that matters.
    }
  }
  return true;
}