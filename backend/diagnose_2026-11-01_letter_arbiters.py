#!/usr/bin/env python3
"""Which answers did the shape arbiters change, and what did Tesseract say?

    python3 diagnose_2026-11-01_letter_arbiters.py <page.webp> [more...]

Run from the backend root (the directory holding app/), venv active. It reads
only; it changes nothing.

WHY
---
Exam 13 page 2 is a pure matching sheet, Column B A-J, and four answers are
wrong in two clean pairs:

    22  I -> T        37  I -> T
    29  E -> F        39  E -> F

The I->T pair has an obvious suspect: page_alphabet appends "T" to every
alphabet, so T was on offer on a sheet that has no True/False anywhere, and a
serif capital I is a T with one extra stroke.

The E->F pair has TWO possible causes that need opposite fixes:

  (a) Tesseract itself read "F", or
  (b) Tesseract read "E" and the 2026-10-31 bottom-bar branch in
      classify_letter flipped it to F because it could not find the foot.

If (b), that branch is a regression I introduced and should be narrowed or
reverted. This prints which one it is, per blank, by wrapping the real
functions rather than re-implementing them.

Also prints what each arbiter would do WITHOUT "T" in the alphabet, so the
I->T half can be confirmed before anything is changed.
"""
import contextlib
import io
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(".").resolve()))

import app.ml.ocr_written_letter as wl                                  # noqa: E402
from app.ml.ocr_shared import load_gray, ink_mask, estimate_text_height  # noqa: E402
from app.ml.ocr_item_numbers import (read_page_text, find_item_numbers,  # noqa: E402
                                     page_alphabet, option_labels)
from app.ml.ocr import MIXED_LETTERS                                     # noqa: E402


def report(path: str) -> None:
    print("=" * 78)
    print(path)
    print("=" * 78)

    gray, _ = load_gray(path)
    ink = ink_mask(gray)
    text_h = estimate_text_height(ink)
    d = read_page_text(gray)
    ladder = find_item_numbers(d)
    labels = option_labels(d)
    alphabet = page_alphabet(d, fallback=MIXED_LETTERS) if labels else "TF"
    no_t = alphabet.replace("T", "") or alphabet

    print(f"text_h={text_h:.1f}  printed labels={sorted(labels)}")
    print(f"alphabet in use = {alphabet}")
    print(f"same without T  = {no_t}")
    print(f"ladder: {len(ladder)} items {sorted(ladder)[:4]}...{sorted(ladder)[-2:]}\n")

    rows = []
    orig_cls = wl.classify_letter
    orig_bar = getattr(wl, "_has_bottom_bar", None)
    orig_mid = getattr(wl, "_has_mid_bar", None)

    def make_spy():
        state = {}

        def cls(tight, th, letters):
            state.clear()
            glyph = wl._first_glyph(tight, th)
            raw = ("", 0.0)
            if glyph is not None:
                for cand in (glyph, tight):
                    l, c = wl._tess_letter(cand, letters)
                    if l and c > raw[1]:
                        raw = (l, c)
            state["raw"] = raw
            state["foot"] = (orig_bar(glyph > 0)
                             if orig_bar and glyph is not None else None)
            state["midbar"] = (orig_mid(glyph > 0)
                               if orig_mid and glyph is not None else None)
            out = orig_cls(tight, th, letters)
            rows.append((state["raw"], state["foot"], state["midbar"], out, letters))
            return out
        return cls

    wl.classify_letter = make_spy()
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            wl.ocr_page_written_letter(path, keep_blanks=True, letters=alphabet)
    finally:
        wl.classify_letter = orig_cls

    items = sorted(ladder)
    # The blanks are listed in page order. The item number beside each one is
    # only the ladder's n-th entry, so it drifts whenever the blank count and
    # the ladder length differ - read it as a hint, and the ORDER as the fact.
    print("blanks in page order; the item column is approximate when the"
          f" counts differ ({len(rows)} blanks vs {len(items)} ladder items)\n")
    print(f"{'~item':>5} {'tesseract':>12} {'foot?':>6} {'midbar?':>8} {'final':>6}  verdict")
    for i, (raw, foot, mid, out, letters) in enumerate(rows):
        n = items[i] if i < len(items) else "?"
        tess = f"{raw[0] or '-'}@{raw[1]:.2f}"
        why = ""
        if out[0] != raw[0] and raw[0]:
            if raw[0] == "E" and out[0] == "F":
                why = "<<< BOTTOM-BAR BRANCH flipped E->F"
            elif raw[0] in ("C", "D") and out[0] == "G":
                why = "<<< MID-BAR BRANCH flipped to G"
            else:
                why = f"<<< arbiter changed {raw[0]} -> {out[0]}"
        print(f"{str(n):>5} {tess:>12} {str(foot):>6} {str(mid):>8} "
              f"{out[0] or '-':>6}  {why}")

    # second pass with T removed, to size the I->T half
    if "T" in alphabet:
        rows2 = []
        wl.classify_letter = (lambda f: f)(make_spy())
        saved = rows[:]
        rows.clear()
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                wl.ocr_page_written_letter(path, keep_blanks=True, letters=no_t)
        finally:
            wl.classify_letter = orig_cls
        rows2 = rows[:]
        rows[:] = saved
        print(f"\n-- what changes if T is dropped from the alphabet ({no_t}) --")
        changed = 0
        for i, (a, b) in enumerate(zip(saved, rows2)):
            if a[3][0] != b[3][0]:
                changed += 1
                n = items[i] if i < len(items) else "?"
                print(f"   item {n}: {a[3][0] or '-'}  ->  {b[3][0] or '-'}")
        print(f"   {changed} answer(s) would change")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        report(p)
        print()
