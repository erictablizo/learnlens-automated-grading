"""
app/services/exam_service.py

CHANGED 2026-10-23 — Doc Rubrica, sixth comment. Three things:

  1. `correct_answer=a.letter[:10]` SILENTLY TRUNCATED identification answers.
     COMMUNICATION was stored as 'COMMUNICAT', PROOFREADING as 'PROOFREADI',
     'THESIS STATEMENT' as 'THESIS STA'. It then never matched anything and the
     teacher could not fix it by hand either, because the correction was
     truncated on save too. The slice is gone; the column has to grow instead
     (migrations/2026-10-23_parts_and_answer_length.sql).

  2. `generate_answer_key_parts()` — one page, several declared parts. Her page 2
     holds four of them and one `question_type` per page cannot express that.

  3. Declared parts are PERSISTED. This is not optional. A paper must be read
     with the same ranges its key was built with, and `infer_question_type()`
     cannot recover them: `encircled` and `written_letter` both store a bare
     letter, so a key of C D A E B F is indistinguishable between the two.
     Without the `exam_page_parts` table a Part III paper is checked with the
     circle detector and every student scores zero on it.

`generate_answer_key()` is untouched in behaviour for single-type pages.
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload
import os

from app.models.models import (
    Exam, ExamPage, AnswerKey, TestPaper, PaperScore, ExamPagePart,
)


async def get_exams(db: AsyncSession, user_id: int) -> List[Exam]:
    result = await db.execute(
        select(Exam).where(Exam.created_by == user_id).order_by(Exam.created_at.desc())
    )
    return list(result.scalars().all())


async def get_exam(db: AsyncSession, exam_id: int, user_id: int) -> Optional[Exam]:
    """
    CHANGED 2026-10-24: `.selectinload(ExamPage.parts)` chained onto the pages
    load. ExamPageResponse now nests each page's declared parts, and WITHOUT
    this line reading page.parts raises
        MissingGreenlet: greenlet_spawn has not been called
    which FastAPI turns into a 500 on GET /exams/{id}. One extra query, and it
    saves the exam screen a request per page.
    """
    result = await db.execute(
        select(Exam)
        .options(selectinload(Exam.pages).selectinload(ExamPage.parts),
                 selectinload(Exam.answer_keys))
        .where(Exam.exam_id == exam_id, Exam.created_by == user_id)
    )
    return result.scalar_one_or_none()


async def create_exam(db: AsyncSession, user_id: int, exam_name: str, description: str) -> Exam:
    exam = Exam(created_by=user_id, exam_name=exam_name.strip(), description=description.strip())
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam


async def update_exam(db: AsyncSession, exam_id: int, user_id: int, **kwargs) -> Optional[Exam]:
    result = await db.execute(select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id))
    exam = result.scalar_one_or_none()
    if not exam:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(exam, k, v.strip() if isinstance(v, str) else v)
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, exam_id: int, user_id: int) -> bool:
    result = await db.execute(select(Exam).where(Exam.exam_id == exam_id, Exam.created_by == user_id))
    exam = result.scalar_one_or_none()
    if not exam:
        return False
    paths = (await db.execute(select(ExamPage.image_path).where(ExamPage.exam_id == exam_id))).scalars().all()
    await db.delete(exam)
    await db.commit()
    for path in paths:          # remove the uploaded images too
        _remove_file(path)
    return True


def _remove_file(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


async def add_exam_page(db: AsyncSession, exam_id: int, page_number: int, image_path: str) -> ExamPage:
    """
    FIX 2026-09-22: uploading a NEW image for an existing page number (Edit Exam)
    used to crash on the (exam_id, page_number) unique constraint. Now the page is
    updated in place and its old answer key rows are removed (they belong to the old image).

    CHANGED 2026-10-23: the page's declared PARTS are dropped too. They describe
    the layout of the image that was just replaced; keeping them would read the
    new photo with the old item ranges, which is worse than having none.
    """
    existing = (await db.execute(
        select(ExamPage).where(ExamPage.exam_id == exam_id, ExamPage.page_number == page_number)
    )).scalar_one_or_none()
    if existing:
        if existing.image_path != image_path:
            _remove_file(existing.image_path)
        existing.image_path = image_path
        await db.execute(delete(AnswerKey).where(AnswerKey.page_id == existing.page_id))
        await db.execute(delete(ExamPagePart).where(ExamPagePart.page_id == existing.page_id))
        await db.commit()
        await renumber_answer_keys(db, exam_id)
        await db.refresh(existing)
        return existing
    page = ExamPage(exam_id=exam_id, page_number=page_number, image_path=image_path)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


async def set_page_number(db: AsyncSession, exam_id: int, page_id: int, new_number: int) -> dict:
    """
    NEW 2026-09-29 (Edit Exam enhancement): change which page number an already
    uploaded image belongs to, without re-uploading it.

    Page numbers stay 1..N with no gaps, so this is a SWAP: moving page 3 to
    page 1 gives the old page 1 the number 3. The (exam_id, page_number) unique
    key would collide half-way through, so the other page is parked on a
    temporary number first.

    Afterwards the answer key is renumbered (it is ordered by page) and every
    checked paper is reset, because question 1 may now be a different question.

    NOTE 2026-10-23: parts move WITH the page, because they belong to the image,
    not to the position. But a reorder makes the declared item numbers wrong -
    "items 19-24" is only true while that image is page 2 - so any page of this
    exam that has declared parts blocks the swap and says so.
    """
    if await exam_uses_parts(db, exam_id):
        return {"success": False,
                "reason": ("This exam declares item ranges per page, so its pages cannot be "
                           "reordered - the declared numbers (e.g. 'items 19-24') belong to a "
                           "position. Change the ranges on each page instead.")}

    pages = list((await db.execute(
        select(ExamPage).where(ExamPage.exam_id == exam_id).order_by(ExamPage.page_number)
    )).scalars().all())
    page = next((p for p in pages if p.page_id == page_id), None)
    if not page:
        return {"success": False, "reason": "Page not found."}
    if not 1 <= new_number <= len(pages):
        return {"success": False,
                "reason": f"Page number must be between 1 and {len(pages)}."}
    if page.page_number == new_number:
        return {"success": True, "changed": False, "reset": 0,
                "message": f"Page {new_number} is unchanged."}

    old_number = page.page_number
    other = next((p for p in pages if p.page_number == new_number), None)

    park = max(p.page_number for p in pages) + 1000
    if other:
        other.page_number = park
        await db.flush()
    page.page_number = new_number
    await db.flush()
    if other:
        other.page_number = old_number
    await db.commit()

    await renumber_answer_keys(db, exam_id)
    reset = await reset_exam_paper_scores(db, exam_id)

    msg = (f"Page {old_number} is now page {new_number}."
           if not other else
           f"Pages {old_number} and {new_number} were swapped.")
    if reset:
        msg += f" {reset} checked paper(s) were reset and must be checked again."
    return {"success": True, "changed": True, "reset": reset, "message": msg}


async def has_checked_papers(db: AsyncSession, exam_id: int) -> bool:
    result = await db.execute(
        select(TestPaper.paper_id).where(TestPaper.exam_id == exam_id, TestPaper.checked == True).limit(1)  # noqa: E712
    )
    return result.first() is not None


async def reset_exam_paper_scores(db: AsyncSession, exam_id: int) -> int:
    papers = list((await db.execute(select(TestPaper).where(TestPaper.exam_id == exam_id))).scalars().all())
    count = 0
    for paper in papers:
        if paper.checked:
            await db.execute(delete(PaperScore).where(PaperScore.paper_id == paper.paper_id))
            paper.total_score = None
            paper.checked = False
            count += 1
    if count:
        await db.commit()
    return count


async def renumber_answer_keys(db: AsyncSession, exam_id: int) -> None:
    """
    FIX 2026-09-22: keep question numbers continuous 1..N ordered by page.
    Before, re-generating page 1 with a different count (e.g. 16 -> 12) left
    page 2's numbers wrong, or crashed on the (exam_id, question_number) unique key.
    Two passes (+1000 first) so the unique constraint never collides mid-update.

    NOTE 2026-10-23: this must NOT run on an exam with declared parts. There the
    teacher states the item numbers herself ("items 19-24"), and renumbering
    would silently move her answers to different questions. `generate_answer_key_parts`
    skips it; `generate_answer_key` still calls it, and bails out here if the
    exam has gone over to parts in the meantime.
    """
    if await exam_uses_parts(db, exam_id):
        return
    rows = (await db.execute(
        select(AnswerKey.answer_key_id)
        .join(ExamPage, ExamPage.page_id == AnswerKey.page_id)
        .where(AnswerKey.exam_id == exam_id)
        .order_by(ExamPage.page_number, AnswerKey.question_number)
    )).scalars().all()
    if not rows:
        return
    await db.execute(update(AnswerKey).where(AnswerKey.exam_id == exam_id)
                     .values(question_number=AnswerKey.question_number + 1000))
    for i, ak_id in enumerate(rows, start=1):
        await db.execute(update(AnswerKey).where(AnswerKey.answer_key_id == ak_id).values(question_number=i))
    await db.commit()


# ---------------------------------------------------------------------------
# NEW 2026-10-23 — declared parts
# ---------------------------------------------------------------------------

async def exam_uses_parts(db: AsyncSession, exam_id: int) -> bool:
    row = (await db.execute(
        select(ExamPagePart.part_id).where(ExamPagePart.exam_id == exam_id).limit(1)
    )).first()
    return row is not None


async def get_page_parts(db: AsyncSession, page_id: int) -> List[ExamPagePart]:
    """The declared parts of one page, in item order. This is what Checking
    Paper reads so a paper is OCR'd exactly as its key was."""
    rows = (await db.execute(
        select(ExamPagePart).where(ExamPagePart.page_id == page_id)
        .order_by(ExamPagePart.first_item)
    )).scalars().all()
    return list(rows)


async def clear_page_parts(db: AsyncSession, exam_id: int, page_id: int) -> int:
    """Remove a page's declared parts so the single-type path can be used again.

    `generate_answer_key()` refuses to overwrite a page that has parts, so
    without this a page declared once could never go back to one question type.
    The page's answer key goes with them: it was generated from those ranges and
    keeping it would leave rows whose numbers nothing explains.
    """
    parts = await get_page_parts(db, page_id)
    if not parts:
        return 0
    await db.execute(delete(ExamPagePart).where(ExamPagePart.page_id == page_id))
    await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id,
                                            AnswerKey.page_id == page_id))
    await db.commit()
    await reset_exam_paper_scores(db, exam_id)
    return len(parts)


def validate_parts(raw: List[dict]) -> tuple[list, str]:
    """Check a page's declared parts and build PagePart objects.

    PURE FUNCTION so it can be unit-tested without a database. Returns
    (parts, "") or ([], reason). Rules, each one a mistake a teacher can make:
      * at least one part, at most 20
      * every item number between 1 and 500, last >= first
      * no two parts on the page overlapping
      * a known question type
      * for written_letter, a letters alphabet of 2-10 distinct A-Z characters
    Gaps BETWEEN parts are allowed: her page 2 declares item 12 and then 13-18,
    and a page may legitimately skip items that live on another page.
    """
    from app.ml.ocr import PagePart, normalize_question_type, QUESTION_TYPES, DEFAULT_LETTERS

    if not raw:
        return [], "Declare at least one part for this page."
    if len(raw) > 20:
        return [], "A page cannot have more than 20 parts."

    parts = []
    for i, r in enumerate(raw, start=1):
        try:
            first = int(r.get("first_item"))
            last = int(r.get("last_item"))
        except (TypeError, ValueError):
            return [], f"Part {i}: the first and last item numbers must be whole numbers."
        if not (1 <= first <= 500 and 1 <= last <= 500):
            return [], f"Part {i}: item numbers must be between 1 and 500."
        if last < first:
            return [], f"Part {i}: the last item ({last}) is before the first ({first})."

        qt = normalize_question_type(r.get("question_type"))
        if qt not in QUESTION_TYPES or qt == "mixed":
            return [], (f"Part {i}: '{r.get('question_type')}' is not a question type a part "
                        "can have. Use Multiple Choice (encircled), Write the Letter, "
                        "Identification or True/False.")

        letters = (r.get("letters") or DEFAULT_LETTERS).strip().upper()
        if qt == "written_letter":
            seen = []
            for ch in letters:
                if not ("A" <= ch <= "Z"):
                    return [], f"Part {i}: the choices must be letters A-Z, not '{ch}'."
                if ch not in seen:
                    seen.append(ch)
            if not 2 <= len(seen) <= 10:
                return [], f"Part {i}: give between 2 and 10 choices (e.g. ABCD, or ABCDEF)."
            letters = "".join(seen)
        else:
            letters = DEFAULT_LETTERS

        parts.append(PagePart(first_item=first, last_item=last,
                              question_type=qt, letters=letters))

    parts.sort(key=lambda p: p.first_item)
    for a, b in zip(parts, parts[1:]):
        if b.first_item <= a.last_item:
            return [], (f"Items {b.first_item}-{b.last_item} overlap items "
                        f"{a.first_item}-{a.last_item}. Each item belongs to one part.")
    return parts, ""


def key_rows_from_parts(parts: list, answers: dict) -> list[tuple[int, str, float]]:
    """(question_number, correct_answer, confidence) for every DECLARED item.

    PURE FUNCTION, and the reason it exists is the one bug that silently
    destroys an answer key: an item that could not be read must keep its slot.
    `generate_answer_key()` filters `if a.letter`, which is right when the
    numbers are assigned afterwards by position, and catastrophic here - drop
    item 20 and item 21's answer becomes the key for item 20, and every later
    item is wrong by one with nothing on screen to show it.

    So an unread item is stored as "" and the caller reports how many. The
    teacher fills those in; papers cannot be checked against a key with holes.
    """
    rows: list[tuple[int, str, float]] = []
    for part in sorted(parts, key=lambda p: p.first_item):
        for q in range(part.first_item, part.last_item + 1):
            letter, conf = answers.get(q, ("", 0.0))
            rows.append((q, (letter or "").strip(), round(float(conf or 0.0), 2)))
    return rows


async def generate_answer_key_parts(
    db: AsyncSession,
    exam_id: int,
    page_id: int,
    raw_parts: List[dict],
) -> dict:
    """
    Run OCR on one exam page whose parts the teacher has declared, save the key,
    and SAVE THE PARTS so the papers can be read the same way.

    raw_parts: [{"first_item": 13, "last_item": 18,
                 "question_type": "written_letter", "letters": "ABCDEF"}, ...]
    """
    from app.ml.ocr import ocr_page_parts, setup_tesseract

    parts, reason = validate_parts(raw_parts)
    if reason:
        return {"success": False, "reason": reason}

    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if not page:
        return {"success": False, "reason": "Exam page not found."}
    if not os.path.exists(page.image_path):
        return {"success": False, "reason": "The image of this page is missing on the server. Upload it again."}

    # Another page of this exam must not already own these item numbers.
    clash = (await db.execute(
        select(ExamPagePart, ExamPage.page_number)
        .join(ExamPage, ExamPage.page_id == ExamPagePart.page_id)
        .where(ExamPagePart.exam_id == exam_id, ExamPagePart.page_id != page_id)
    )).all()
    for other, other_page_no in clash:
        for p in parts:
            if p.first_item <= other.last_item and other.first_item <= p.last_item:
                return {"success": False,
                        "reason": (f"Items {p.first_item}-{p.last_item} are already declared on "
                                   f"page {other_page_no} (items {other.first_item}-{other.last_item}). "
                                   "Each item belongs to one page.")}

    try:
        from app.core.config import settings
        if getattr(settings, "TESSERACT_CMD", ""):
            setup_tesseract(settings.TESSERACT_CMD)
        # keep_blanks=True is mandatory here - see key_rows_from_parts.
        result = ocr_page_parts(page.image_path, parts, keep_blanks=True)
    except ImportError:
        return {"success": False, "reason": "OCR libraries not installed (opencv-python, pytesseract)."}
    except Exception as exc:
        return {"success": False, "reason": f"OCR error: {exc}"}

    if not result.success:
        return {"success": False, "reason": result.reason, "warnings": result.warnings}

    rows = key_rows_from_parts(parts, result.answers)
    read = sum(1 for _q, ans, _c in rows if ans)
    if not read:
        return {"success": False,
                "reason": "No answers could be read from this page. Check that the photo is clear.",
                "warnings": result.warnings}

    # Replace this page's key and its parts.
    await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id, AnswerKey.page_id == page_id))
    await db.execute(delete(ExamPagePart).where(ExamPagePart.page_id == page_id))
    for p in parts:
        db.add(ExamPagePart(
            exam_id=exam_id, page_id=page_id,
            first_item=p.first_item, last_item=p.last_item,
            question_type=p.question_type, letters=p.letters,
        ))
    for q, ans, conf in rows:
        db.add(AnswerKey(
            exam_id=exam_id, page_id=page_id, question_number=q,
            correct_answer=ans,              # NOT truncated - see the module docstring
            ocr_confidence=conf,
        ))
    await db.commit()
    # Deliberately NO renumber_answer_keys(): the declared numbers are the
    # teacher's, and renumbering would move her answers to other questions.
    reset = await reset_exam_paper_scores(db, exam_id)

    blanks = [q for q, ans, _c in rows if not ans]
    msg = f"Answer key generated: {read} of {len(rows)} items read on page {page.page_number}."
    if blanks:
        shown = ", ".join(str(q) for q in blanks[:10]) + ("…" if len(blanks) > 10 else "")
        msg += (f" {len(blanks)} item(s) could not be read and were left blank "
                f"({shown}). Fill them in before checking papers.")
    if reset:
        msg += f" {reset} checked paper(s) were reset and must be checked again."
    return {
        "success": True,
        "detected": read,
        "total_items": len(rows),
        "blank_items": blanks,
        "parts": [{"first_item": p.first_item, "last_item": p.last_item,
                   "question_type": p.question_type, "letters": p.letters} for p in parts],
        "message": msg,
        "warnings": result.warnings,
    }


async def generate_answer_key(
    db: AsyncSession,
    exam_id: int,
    page_id: int,
    question_type: str = "encircled",
    expected_items: Optional[int] = None,
) -> dict:
    """
    Run OCR on one exam page and save its answer key.

    FIX 2026-09-22:
      * passes `expected_items` ("Number of items on this page") to the OCR so
        exactly that many answers are kept (12 for p.6 MC, 20 for p.14 T/F).
      * question numbers of later pages are renumbered after every generate.
      * scores of already-checked papers are reset, because the key changed.

    CHANGED 2026-10-23: the `[:10]` truncation of `correct_answer` is removed,
    and a page declared with parts cannot be overwritten by this single-type
    path by accident.
    """
    from app.ml.ocr import ocr_page, setup_tesseract, normalize_question_type, QUESTION_TYPES

    question_type = normalize_question_type(question_type)
    if question_type not in QUESTION_TYPES:
        return {"success": False,
                "reason": ("Question type must be Multiple Choice, Write the Letter, "
                           "Identification, True/False or Mixed.")}
    if expected_items is not None and not (1 <= expected_items <= 200):
        return {"success": False, "reason": "Number of items must be between 1 and 200."}

    page = (await db.execute(
        select(ExamPage).where(ExamPage.page_id == page_id, ExamPage.exam_id == exam_id)
    )).scalar_one_or_none()
    if not page:
        return {"success": False, "reason": "Exam page not found."}
    if not os.path.exists(page.image_path):
        return {"success": False, "reason": "The image of this page is missing on the server. Upload it again."}

    if await get_page_parts(db, page_id):
        return {"success": False,
                "reason": ("This page has declared item ranges. Generate its key from those "
                           "parts, or clear them first - one question type for the whole page "
                           "would overwrite them.")}

    try:
        from app.core.config import settings
        if getattr(settings, "TESSERACT_CMD", ""):
            setup_tesseract(settings.TESSERACT_CMD)
        result = ocr_page(page.image_path, question_type=question_type, expected_items=expected_items)
    except ImportError:
        return {"success": False, "reason": "OCR libraries not installed (opencv-python, pytesseract)."}
    except Exception as exc:
        return {"success": False, "reason": f"OCR error: {exc}"}

    if result.error:
        return {"success": False, "reason": result.error}
    answers = [a for a in result.answers if a.letter]
    if not answers:
        kind = {"true_false": "True/False answers",
                "written_letter": "written letters",
                "identification": "written answers"}.get(question_type, "encircled answers")
        return {"success": False, "reason": f"No {kind} detected on this page. Ensure answers are clearly marked."}

    # Replace this page's key, appended after all other keys, then renumber 1..N by page
    await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id, AnswerKey.page_id == page_id))
    max_q = (await db.execute(
        select(AnswerKey.question_number).where(AnswerKey.exam_id == exam_id)
        .order_by(AnswerKey.question_number.desc()).limit(1)
    )).scalar_one_or_none() or 0
    for idx, a in enumerate(answers, start=1):
        db.add(AnswerKey(
            exam_id=exam_id, page_id=page_id, question_number=max_q + idx,
            correct_answer=a.letter, ocr_confidence=round(float(a.confidence), 2),
        ))
    await db.commit()
    await renumber_answer_keys(db, exam_id)
    reset = await reset_exam_paper_scores(db, exam_id)

    msg = f"Answer key generated: {len(answers)} answers detected on page {page.page_number}."
    if reset:
        msg += f" {reset} checked paper(s) were reset and must be checked again."
    return {
        "success": True,
        "detected": len(answers),
        "expected_items": expected_items,
        "question_type": question_type,
        "message": msg,
        "warning": result.warning,
    }