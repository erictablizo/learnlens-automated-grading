"""
app/services/key_image_service.py
=================================
NEW 2026-11-12 — rebuilding an answer key from a picture of the answers.

    Alex Passion, post-UAT page 3:
    "For uploading the Answer Key, an option to upload image of enumerated
     List of answers only (without the questionnaire)."

    Page 3 again, on the format:
    "to re-create ANS-KEY -> OCR, same captions = 1. 2. 3. ... (enumerated)"

WHY THIS EXISTS AT ALL
----------------------
The existing path reads the QUESTIONNAIRE and infers the key from encircled
options. On the real sheets that miscounts: the project's own notes record a
12-item multiple choice page read as 16 answers, and a 20-item True/False page
read as 107. Option letters and question text are indistinguishable from
answers to a detector looking for marks.

A key-only image has nothing on it but "N. ANSWER". There is no option text to
mistake for an answer, so the count is whatever the teacher wrote.

IT PREVIEWS. IT DOES NOT APPLY.
-------------------------------
`answer_key_service.update_key_item` re-checks EVERY paper against the new
answer and re-totals every affected student - that cascade is the 2026-11-11
recommendation working as intended. An OCR that is 95% right on handwriting
must therefore never write straight through: one misread item would silently
re-score a whole section against a letter nobody chose.

So reading and writing are two calls. `preview()` returns what it read, which
items DIFFER from the key on file, and which it is unsure about. The teacher
fixes the flagged ones and confirms; `apply()` then goes through
`update_key_item`, so the cascade, the re-total and the toast behave exactly as
they do for a manual edit. There is no second copy of the cascade.

UPDATES ONLY, BY DESIGN
-----------------------
`update_key_item` raises AnswerKeyItemNotFound for a question number that has
no row, and this service does NOT create one. Changing how many items an exam
has is a different operation: `PaperScore.answer_key_id` is a real foreign key,
so adding or removing key rows invalidates already-graded papers in a way a
key correction does not. An item in the image with no row on file is reported
as `not_in_key` and left alone - the teacher regenerates the key if the COUNT
is wrong, and uses this to fix the ANSWERS.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import cv2
import pytesseract
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AnswerKey, ExamPage
from app.services.key_text import ParseResult, parse_key_text
from app.services.paper_service import _owned_exam
from app.services import answer_key_service

# Same configuration ocr_service uses, for the same reason: one place decides
# where the tesseract binary is.
from app.services.ocr_service import _init_tesseract

# MEASURED over 125 answers on six sheets - five printed layouts and the real
# handwritten True/False key:
#
#   raw  + psm 6   124/125   best single combination
#   otsu + psm 4    85/125   but 20/20 on the HANDWRITTEN sheet, which raw
#                            reads 19/20
#   psm 11           25/125  collapses
#   adaptive/denoise 121/116 thresholding makes printed text WORSE
#
# So: try a few and keep the best read. Trying all three scores 125/125.
# Do not "improve" this by binarising first - that was measured and it loses.
_ATTEMPTS = (("raw", 6), ("otsu", 4), ("raw", 4))

MAX_IMAGE_PIXELS = 40_000_000     # ~8000x5000; a phone photo is well under


def _prepare(img, mode: str):
    """Grayscale in, grayscale out. Upscales a small crop; optionally Otsu."""
    h, w = img.shape[:2]
    if max(h, w) < 1000:
        # A tight phone crop of 20 lines can arrive ~600px tall, which
        # tesseract reads poorly. Cubic upscale to 1000 recovers it.
        f = 1000.0 / max(h, w)
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    if mode == "otsu":
        return cv2.threshold(img, 0, 255,
                             cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    return img


def _score(res: ParseResult) -> tuple:
    """Rank two readings of the same image. Higher is better.

    A GAP-FREE read of confident items beats a longer ragged one. A missing
    item is a hole the teacher has to notice; a flagged item is one they have
    to check. Both cost attention, and the hole costs more because nothing
    draws the eye to it.
    """
    if not res.items:
        return (-1, 0, 0)
    nums = [i.question_number for i in res.items]
    contiguous = sorted(set(nums)) == list(range(1, max(nums) + 1))
    confident = sum(1 for i in res.items if i.confident)
    return (1 if contiguous else 0, confident, len(res.items))


def read_key_image(path: str) -> tuple[ParseResult, str]:
    """OCR an enumerated answer list. Returns (result, "mode/psmN")."""
    _init_tesseract()
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("That file could not be opened as an image.")
    if img.shape[0] * img.shape[1] > MAX_IMAGE_PIXELS:
        raise ValueError("That image is too large. Please use a smaller photo.")

    best: Optional[tuple[ParseResult, str]] = None
    for mode, psm in _ATTEMPTS:
        text = pytesseract.image_to_string(_prepare(img, mode),
                                           config=f"--psm {psm}")
        res = parse_key_text(text)
        if best is None or _score(res) > _score(best[0]):
            best = (res, f"{mode}/psm{psm}")
    assert best is not None
    return best


async def preview(
    db: AsyncSession, exam_id: int, page_id: int, path: str, user_id: int,
) -> Optional[Dict[str, Any]]:
    """What this image says, next to what the key says now. Writes NOTHING.

    None when the exam is not this teacher's, so the route answers 404 without
    confirming someone else's exam_id exists - the same shape as
    `exam_item_analytics` and `update_key_item`.
    """
    if not await _owned_exam(db, exam_id, user_id):
        return None

    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id,
                               ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if page is None:
        return None

    result, how = read_key_image(path)

    current = {
        k.question_number: (k.correct_answer or "")
        for k in (await db.execute(
            select(AnswerKey).where(AnswerKey.exam_id == exam_id,
                                    AnswerKey.page_id == page_id)
        )).scalars().all()
    }

    items: List[Dict[str, Any]] = []
    changed = unchanged = not_in_key = 0
    for it in result.items:
        on_file = current.get(it.question_number)
        if on_file is None:
            status = "not_in_key"; not_in_key += 1
        elif on_file.strip().upper() == it.answer.strip().upper():
            status = "same"; unchanged += 1
        else:
            status = "changed"; changed += 1
        items.append({
            "question_number": it.question_number,
            "answer":          it.answer,
            "current_answer":  on_file,
            "status":          status,
            "confident":       it.confident,
            "note":            it.note,
            "raw":             it.raw,
        })

    problems = list(result.problems)
    # The item COUNT disagreeing with the key on file is the single most
    # useful thing this screen can say - it is the "12 answers read as 16"
    # fault, visible before anything is written rather than after.
    if current and result.items and len(result.items) != len(current):
        problems.append(
            f"This image has {len(result.items)} answer(s) but the key on file "
            f"has {len(current)} for page {page.page_number}. Regenerate the "
            "key if the number of items is wrong."
        )

    return {
        "exam_id":       exam_id,
        "page_id":       page_id,
        "page_number":   page.page_number,
        "read_with":     how,
        "items":         items,
        "changed":       changed,
        "unchanged":     unchanged,
        "not_in_key":    not_in_key,
        "needs_check":   sum(1 for i in result.items if not i.confident),
        "skipped_lines": result.skipped,
        "problems":      problems,
    }


async def apply(
    db: AsyncSession, exam_id: int, answers: Dict[int, str], user_id: int,
) -> Optional[Dict[str, Any]]:
    """Write the confirmed answers, one `update_key_item` call each.

    ONE CALL PER CHANGED ITEM, deliberately. That function owns the cascade,
    the re-check and the re-total; a batched copy here would be a second
    implementation of the grading rule, which is the defect this project has
    hit repeatedly (_identification_items copied out of ocr_service,
    _user_by_email with three callers and one user).

    Only items whose answer actually DIFFERS are sent, so a 20-item key with
    three corrections costs three cascades, not twenty.
    """
    if not await _owned_exam(db, exam_id, user_id):
        return None

    updated: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    papers_touched: set = set()
    flipped = 0

    for q in sorted(answers):
        value = (answers[q] or "").strip()
        if not value:
            skipped.append({"question_number": q, "reason": "blank answer"})
            continue
        try:
            res = await answer_key_service.update_key_item(
                db, exam_id, q, value, user_id)
        except answer_key_service.AnswerKeyItemNotFound:
            skipped.append({"question_number": q,
                            "reason": "not in this exam's answer key"})
            continue
        except answer_key_service.BlankAnswerKey as e:
            skipped.append({"question_number": q, "reason": str(e)})
            continue
        if res is None:                      # ownership changed under us
            return None
        if res["old_answer"].strip().upper() == value.upper():
            continue                          # nothing moved
        flipped += res["items_flipped"]
        papers_touched.update(p["paper_id"] for p in res["papers_rescored"])
        updated.append({
            "question_number": q,
            "old_answer":      res["old_answer"],
            "correct_answer":  res["correct_answer"],
            "papers_affected": res["papers_affected"],
            "papers_rescored": res["papers_rescored"],
        })

    return {
        "exam_id":         exam_id,
        "items_updated":   len(updated),
        "items_flipped":   flipped,
        "papers_rescored": len(papers_touched),
        "updated":         updated,
        "skipped":         skipped,
    }