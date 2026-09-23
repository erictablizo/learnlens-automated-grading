"""
app/ml/ocr_true_false.py — True/False (written) OCR
====================================================
 
FIX 2026-09-22 — "Answer key shows 107 answers but the sheet only has 20"
-------------------------------------------------------------------------
Old pipeline: every contour 15-200 px wide was OCR'd with `--psm 6` and
accepted if the text merely *started with* "T" or "F". Printed words such as
"The", "To", "This", "For", "From", "Filipino"... all passed, so the whole
question text became answers (107). Hard-coded pixel sizes also broke on
different photo resolutions.
 
New pipeline — one answer per item, never one per word:
  A. BLANK MODE (normal sheets: "____T____ 1. The sun rises in the east")
     1. Find the answer blanks: short horizontal lines (underscores) using a
        horizontal morphological opening. Full-width rules are ignored.
     2. For every blank, look only at the ink written just above/on it.
     3. Classify that handwriting as T or F (see below).
     -> exactly one answer per blank. An empty blank on a student paper is
        kept as "" so later items are not shifted (grading stays aligned).
  B. ROW MODE (fallback when no blanks are printed)
     1. Group ink into text lines; take the FIRST word of each line.
     2. Keep only lines whose first word sits in the dominant left answer
        column and is short (a letter or TRUE/FALSE, not "Directions:").
     3. Keep it only if it really reads as T/F/TRUE/FALSE.
  T-vs-F classification = Tesseract (psm 10, whitelist TF) + a stroke-shape
  check (T has its vertical stem in the middle, F has it on the left). When
  both agree confidence is high; if Tesseract is unsure the shape wins.
  Optional `expected_items` keeps the N most confident answers.
"""
 
from __future__ import annotations
 
from typing import Optional
 
import numpy as np
 
from app.ml.ocr_shared import (
    DetectedAnswer,
    OCRPageResult,
    load_gray,
    ink_mask,
    estimate_text_height,
    group_rows,
    sort_column_aware,
    limit_to_expected,
)
 
Box = tuple[int, int, int, int]   # x, y, w, h

# ---------------------------------------------------------------------------
# T / F classification of one handwritten crop
# ---------------------------------------------------------------------------
 
def _first_glyph(bin_crop: "np.ndarray", text_h: float) -> Optional["np.ndarray"]:
    """From a white-on-black crop return the left-most glyph (first letter),
    so "True"/"False" written in full is classified by its first letter.
    Strokes drawn separately (the bar of a T / F lifted off the stem) are
    merged back when they overlap the letter horizontally."""
    import cv2
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(bin_crop, 8)
    comps = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= max(6, text_h * 0.3)]
    tall = [i for i in comps if stats[i, cv2.CC_STAT_HEIGHT] >= 0.5 * text_h]
    if not tall:
        return None
    anchor = min(tall, key=lambda i: stats[i, cv2.CC_STAT_LEFT])
    L = stats[anchor, cv2.CC_STAT_LEFT]
    R = L + stats[anchor, cv2.CC_STAT_WIDTH]
    top = stats[anchor, cv2.CC_STAT_TOP]
    bot = top + stats[anchor, cv2.CC_STAT_HEIGHT]
    group = {anchor}
    slack = 0.15 * text_h
    changed = True
    while changed:
        changed = False
        for i in comps:
            if i in group:
                continue
            l = stats[i, cv2.CC_STAT_LEFT]; r = l + stats[i, cv2.CC_STAT_WIDTH]
            t = stats[i, cv2.CC_STAT_TOP];  b_ = t + stats[i, cv2.CC_STAT_HEIGHT]
            if r < L - slack or l > R + slack:          # no horizontal overlap
                continue
            if b_ < top - 0.6 * text_h or t > bot + 0.3 * text_h:
                continue
            if i in tall and l > L + 0.6 * (R - L) and stats[i, cv2.CC_STAT_WIDTH] > 0.3 * text_h:
                continue                                  # looks like the next letter
            group.add(i)
            L, R = min(L, l), max(R, r); top, bot = min(top, t), max(bot, b_)
            changed = True
    glyph = np.isin(lbl, list(group)).astype(np.uint8) * 255
    ys, xs = np.where(glyph > 0)
    return glyph[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
 
 
def _shape_tf(glyph: "np.ndarray") -> tuple[str, float]:
    """Stroke-geometry classifier.
    T: top bar spans the width, stem roughly centred, nothing at mid-left right side.
    F: stem on the left, a second (middle) bar extending right."""
    h, w = glyph.shape
    if h < 5 or w < 3:
        return "", 0.0
    g = (glyph > 0).astype(np.float32)
    # Stem = column band with the most ink in the lower 60% of the glyph
    lower = g[int(h * 0.4):, :]
    col = lower.sum(axis=0)
    if col.max() <= 0:
        return "", 0.0
    stem_x = float(np.argmax(np.convolve(col, np.ones(max(1, w // 8)), mode="same"))) / max(1, w - 1)
    # Middle bar: ink in the middle band to the right of the stem
    mid = g[int(h * 0.35):int(h * 0.65), :]
    right_of_stem = mid[:, int(min(w - 1, stem_x * w + w * 0.2)):]
    mid_bar = right_of_stem.mean() if right_of_stem.size else 0.0
 
    if stem_x <= 0.35 and mid_bar > 0.05:
        return "F", 0.75
    if 0.3 <= stem_x <= 0.72 and mid_bar < 0.12:
        return "T", 0.75
    if stem_x < 0.3:
        return "F", 0.55
    return "T", 0.55
 
 
_TF_MAP = {"T": "T", "7": "T", "+": "T", "I": "", "F": "F", "E": "F", "P": "F"}
 
 
def _tess_tf(glyph_white_on_black: "np.ndarray") -> tuple[str, float]:
    import cv2
    import pytesseract
    from pytesseract import Output
    img = 255 - glyph_white_on_black
    h, w = img.shape
    s = max(1.0, 90.0 / max(1, h))
    img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    img = cv2.copyMakeBorder(img, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=255)
    try:
        d = pytesseract.image_to_data(img, config="--psm 10 -c tessedit_char_whitelist=TFtf",
                                      output_type=Output.DICT)
    except Exception:
        return "", 0.0
    best, conf = "", 0.0
    for t, c in zip(d["text"], d["conf"]):
        t = (t or "").strip().upper()
        try:
            c = float(c)
        except (TypeError, ValueError):
            continue
        if t and c >= 0 and _TF_MAP.get(t[0]) and c / 100.0 > conf:
            best, conf = _TF_MAP[t[0]], c / 100.0
    return best, conf
 
 
def _word_text(bin_crop: "np.ndarray") -> str:
    """Unrestricted OCR of the whole written word (to recognise TRUE/FALSE)."""
    import cv2
    import pytesseract
    img = 255 - bin_crop
    h = img.shape[0]
    s = max(1.0, 70.0 / max(1, h))
    img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    img = cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    try:
        return pytesseract.image_to_string(img, config="--psm 7").strip().upper()
    except Exception:
        return ""
 
 
def _word_vote(bin_crop: "np.ndarray") -> tuple[str, float]:
    """Handwritten TRUE / FALSE written in full: read the word a few ways
    (plain, whitelisted, psm 7 / 8) and score each reading against the two
    possible words. Letters that exist in only one word decide it
    (R,U -> TRUE; A,L,S -> FALSE), so a sloppy "TUE" or "FAISE" still counts.
    Returns (letter, confidence) or ('', 0)."""
    import cv2
    import difflib
    import pytesseract
    img = 255 - bin_crop
    h = img.shape[0]
    s = max(1.0, 70.0 / max(1, h))
    img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    img = cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    votes = {"T": 0.0, "F": 0.0}
    for cfg in ("--psm 7", "--psm 8",
                "--psm 7 -c tessedit_char_whitelist=TRUEFALS",
                "--psm 8 -c tessedit_char_whitelist=TRUEFALS"):
        try:
            txt = pytesseract.image_to_string(img, config=cfg).upper()
        except Exception:
            continue
        w = "".join(ch for ch in txt if ch.isalpha())
        if len(w) < 2:
            continue
        st = difflib.SequenceMatcher(None, w, "TRUE").ratio()
        sf = difflib.SequenceMatcher(None, w, "FALSE").ratio()
        st += 0.15 * sum(ch in w for ch in "RU")
        sf += 0.15 * sum(ch in w for ch in "ALS")
        if abs(st - sf) >= 0.1:
            votes["T" if st > sf else "F"] += abs(st - sf)
    total = votes["T"] + votes["F"]
    if total <= 0:
        return "", 0.0
    win = "T" if votes["T"] > votes["F"] else "F"
    margin = abs(votes["T"] - votes["F"]) / total        # 0 (split) ... 1 (unanimous)
    return win, round(0.5 + 0.45 * margin, 2)
 
 
def classify_tf(bin_crop: "np.ndarray", text_h: float) -> tuple[str, float, str]:
    """Return (letter 'T'/'F'/'' , confidence 0-1, raw word text)."""
    glyph = _first_glyph(bin_crop, text_h)
    if glyph is None:
        return "", 0.0, ""
    word = _word_text(bin_crop)
    clean = "".join(ch for ch in word if ch.isalnum())
    if clean.startswith("TRU"):
        return "T", 0.95, word
    if clean.startswith("FAL") or clean.startswith("FALS"):
        return "F", 0.95, word
 
    t_letter, t_conf = _tess_tf(glyph)
    s_letter, s_conf = _shape_tf(glyph)
    # Whole-word vote only makes sense when a word (not one letter) is written
    w_letter, w_conf = ("", 0.0)
    if bin_crop.shape[1] > 1.8 * text_h:
        w_letter, w_conf = _word_vote(bin_crop)
 
    score = {"T": 0.0, "F": 0.0}
    if t_letter:
        score[t_letter] += t_conf
    if s_letter:
        score[s_letter] += s_conf * 0.8
    if w_letter:
        score[w_letter] += w_conf * 1.5
    if score["T"] == score["F"] == 0.0:
        return "", 0.0, word
    win = "T" if score["T"] >= score["F"] else "F"
    agree = sum(1 for l in (t_letter, s_letter, w_letter) if l == win)
    conf = min(0.99, 0.45 + 0.17 * agree + 0.1 * (score[win] - score["TF".replace(win, "")]))
    return win, round(max(0.3, conf), 2), word
 
 
# ---------------------------------------------------------------------------
# A. Blank mode
# ---------------------------------------------------------------------------
 
def _find_blanks(ink: "np.ndarray", text_h: float) -> list[Box]:
    import cv2
    H, W = ink.shape
    klen = max(25, int(3.0 * text_h))      # longer than any handwritten T/F bar
    horiz = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (klen, 1)))
    horiz = cv2.dilate(horiz, cv2.getStructuringElement(cv2.MORPH_RECT, (int(text_h * 0.4) + 1, 3)))
    contours, _ = cv2.findContours(horiz, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blanks: list[Box] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w < 4.0 * text_h or w > 0.35 * W:      # too short (letter bar), or a full-width rule
            continue
        if h > 0.6 * text_h:                      # thick = not an underline
            continue
        blanks.append((x, y, w, h))
    return blanks
 
 
def _crop_above_blank(ink: "np.ndarray", b: Box, text_h: float,
                      top_limit: Optional[int] = None) -> "np.ndarray":
    """Handwriting on/above one blank, with only THAT underline erased
    (erasing lines page-wide also erased long T/F bars).
 
    FIX (real photo test): the crop reached 4 text-heights up, which on a
    normally spaced sheet includes the PREVIOUS item's underline. That line
    was merged into the first letter and turned FALSE->T / TRUE->F. The crop
    now stops just below the blank above (`top_limit`), and any leftover
    underline pieces / specks touching the crop border are removed."""
    import cv2
    x, y, w, h = b
    H, W = ink.shape
    pad_x = int(0.4 * text_h)
    x1, x2 = max(0, x - pad_x), min(W, x + w + pad_x)
    y1 = max(0, int(y - 4.0 * text_h))
    if top_limit is not None:
        y1 = max(y1, int(top_limit))
    y2 = min(H, int(y + h + 0.6 * text_h))
    crop = ink[y1:y2, x1:x2].copy()
    ly1, ly2 = max(0, y - 2 - y1), min(crop.shape[0], y + h + 2 - y1)
    crop[ly1:ly2, :] = 0
    return _clean_crop(crop, text_h)
 
 
def _clean_crop(crop: "np.ndarray", text_h: float) -> "np.ndarray":
    """Remove underline fragments and small specks (e.g. the '.' after the
    item number or the tail of the next word) from a handwriting crop."""
    import cv2
    if crop.size == 0:
        return crop
    ch, cw = crop.shape
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(crop, 8)
    out = crop.copy()
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        line_like = w >= 2.5 * text_h and h <= 0.4 * text_h
        touches_top = y == 0 and h < 0.5 * text_h
        touches_side = (x == 0 or x + w >= cw) and w < 0.35 * text_h and h < 0.5 * text_h
        speck = a < max(6, 0.08 * text_h * text_h)
        if line_like or touches_top or touches_side or speck:
            out[lbl == i] = 0
    return out
 
 
def _tight(bin_crop: "np.ndarray") -> Optional["np.ndarray"]:
    ys, xs = np.where(bin_crop > 0)
    if len(xs) == 0:
        return None
    return bin_crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
 
 
def _blank_mode(ink: "np.ndarray", text_h: float) -> list[DetectedAnswer]:
    import cv2
    blanks = _find_blanks(ink, text_h)
    if len(blanks) < 2:
        return []
 
    # Dominant column = the x position shared by the most blanks
    xs = np.array([b[0] for b in blanks])
    counts = [int(np.sum(np.abs(xs - x0) <= 3 * text_h)) for x0 in xs]
    # Several columns (items 1-10 left, 11-20 right) are allowed: keep every
    # x-cluster that holds at least 40% as many blanks as the biggest one.
    top = max(counts)
    keep = [b for b, c in zip(blanks, counts) if c >= max(2, 0.4 * top)]
    if not keep:
        return []
    widths = np.array([b[2] for b in keep])
    med_w = float(np.median(widths))
    keep = [b for b in keep if 0.5 * med_w <= b[2] <= 2.0 * med_w]
 
    # Bottom edge of the nearest blank directly above each blank (same column)
    def _top_limit(b: Box) -> Optional[int]:
        above = [o for o in blanks if o is not b and o[1] < b[1] - 0.5 * text_h
                 and o[0] < b[0] + b[2] and b[0] < o[0] + o[2]]
        if not above:
            return None
        o = max(above, key=lambda o: o[1])
        return o[1] + o[3] + 2
 
    answers: list[DetectedAnswer] = []
    for b in keep:
        crop = _crop_above_blank(ink, b, text_h, _top_limit(b))
        tight = _tight(crop)
        min_ink = max(15, int(0.25 * text_h * text_h * 0.3))
        if tight is None or cv2.countNonZero(crop) < min_ink or tight.shape[0] < 0.4 * text_h:
            answers.append(DetectedAnswer(y=b[1], x=b[0], letter="", confidence=0.0, size=int(text_h)))
            continue
        letter, conf, _ = classify_tf(tight, text_h)
        answers.append(DetectedAnswer(y=b[1], x=b[0], letter=letter, confidence=conf, size=int(text_h)))
    return answers
 
 
# ---------------------------------------------------------------------------
# B. Row mode (no printed blanks)
# ---------------------------------------------------------------------------
 
def _row_mode(ink: "np.ndarray", text_h: float) -> list[DetectedAnswer]:
    import cv2
    H, W = ink.shape
    # Join strokes of one handwritten letter (T bar lifted off the stem) by a
    # small vertical dilation — printed lines are far apart so they stay separate.
    joined = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_RECT, (3, max(3, int(0.5 * text_h)))))
    n, lbl, stats, cents = cv2.connectedComponentsWithStats(joined, 8)
    comps = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a < 10 or h < 0.35 * text_h or h > 4 * text_h or w > 0.3 * W:
            continue
        comps.append((x, y, w, h, i))
    if not comps:
        return []
 
    rows = group_rows(comps, key_y=lambda c: c[1] + c[3] / 2.0, tol=0.6 * text_h)
    firsts: list[tuple[Box, list[int]]] = []
    for r in rows:
        r.sort(key=lambda c: c[0])
        wx, wy, wr, wb = r[0][0], r[0][1], r[0][0] + r[0][2], r[0][1] + r[0][3]
        members = [r[0][4]]
        for c in r[1:]:
            if c[0] - wr <= 0.7 * text_h:
                wr = max(wr, c[0] + c[2]); wy = min(wy, c[1]); wb = max(wb, c[1] + c[3])
                members.append(c[4])
            else:
                break
        firsts.append(((wx, wy, wr - wx, wb - wy), members))
 
    # Short words only: a single letter or TRUE/FALSE — not "Directions:"
    firsts = [f for f in firsts if 0.35 * text_h <= f[0][2] <= 5.0 * text_h]
    if not firsts:
        return []
 
    # Dominant answer column (x-left within +-2 text heights)
    xs = np.array([f[0][0] for f in firsts])
    best_c, best_n = None, 0
    for x0 in xs:
        cnt = int(np.sum(np.abs(xs - x0) <= 2 * text_h))
        if cnt > best_n:
            best_c, best_n = x0, cnt
    col = [f for f in firsts if abs(f[0][0] - best_c) <= 2 * text_h]
 
    answers: list[DetectedAnswer] = []
    for (x, y, w, h), members in col:
        crop = ink[y:y + h, x:x + w] * (np.isin(lbl[y:y + h, x:x + w], members))
        letter, conf, word = classify_tf(crop, text_h)
        clean = "".join(ch for ch in word if ch.isalpha())
        # In row mode we require the word itself to look like an answer,
        # otherwise ordinary first words of sentences would slip in.
        if clean and clean not in ("T", "F", "TRUE", "FALSE") and w > 1.6 * text_h:
            continue
        if letter:
            answers.append(DetectedAnswer(y=y, x=x, letter=letter, confidence=conf, size=int(text_h)))
    return answers
 
 
# ---------------------------------------------------------------------------
# Kept for backwards compatibility (old signature returned (y, x, letter))
# ---------------------------------------------------------------------------
 
def detect_true_false(gray: "np.ndarray") -> list[tuple[int, int, str]]:
    ink = ink_mask(gray)
    th = estimate_text_height(ink)
    ans = _blank_mode(ink, th) or _row_mode(ink, th)
    return [(a.y, a.x, a.letter) for a in ans if a.letter]
 
 
# ---------------------------------------------------------------------------
# Page pipeline
# ---------------------------------------------------------------------------
 
def ocr_page_true_false(image_path: str, expected_items: Optional[int] = None,
                        keep_blanks: bool = False) -> OCRPageResult:
    """keep_blanks=True (student papers) keeps unanswered blanks as '' so the
    numbering of later items is not shifted. For answer keys it is False."""
    try:
        gray, _ = load_gray(image_path)
        ink = ink_mask(gray)
        text_h = estimate_text_height(ink)
        print(f"DEBUG[true_false]: {image_path} text_h={text_h:.1f}px")
 
        answers = _blank_mode(ink, text_h)
        mode = "blank"
        if not any(a.letter for a in answers):
            answers = _row_mode(ink, text_h)
            mode = "row"
        if not keep_blanks:
            answers = [a for a in answers if a.letter]
 
        if not answers:
            return OCRPageResult(
                image_path=image_path, answers=[], mean_conf=0.0,
                error="No True/False answers detected. Ensure T or F is clearly written on each blank.",
            )
 
        answers = sort_column_aware(answers, gray.shape[1])
        answers, warn = limit_to_expected(answers, expected_items)
        answered = [a for a in answers if a.letter]
        mean_conf = round(sum(a.confidence for a in answered) / len(answered), 2) if answered else 0.0
        print(f"DEBUG[true_false]: mode={mode}, {len(answers)} answers -> {[a.letter or '_' for a in answers]}")
        return OCRPageResult(image_path=image_path, answers=answers, mean_conf=mean_conf, warning=warn)
 
    except Exception as exc:
        return OCRPageResult(image_path=image_path, answers=[], mean_conf=0.0, error=str(exc))