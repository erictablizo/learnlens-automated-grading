"""
app/services/correction_service.py
==================================
NEW 2026-11-19 — the specimen-correction table, and the cascade.

    Sir Alex Passion, 19 November 2026, points 4-7: teach the algorithm that a
    dash means E, that this shape means B, that MACHIN means MACHINE.

TWO HALVES, AND THE SECOND ONE IS THE ONE TO READ CAREFULLY.

1. `apply_corrections()` — the pass that sits in `ocr_service.grade_paper`
   between building `detected` and calling `grade_detected`. It is pure, has
   no database imports, and is byte-for-byte the function
   `measure/2026-11-19_specimen_corrections.py` exercises (15 checks).

2. `rescore_for()` — the CASCADE. Saving a correction re-checks every paper
   already in the installation that contains the reading being corrected.

WHY THE CASCADE IS NOT A TWENTY-MINUTE JOB
-------------------------------------------
When this was designed the objection was: *one admin row edit can start a
20-minute job across other teachers' exams*. That figure came from
THROUGHPUT-2026-10-23 — **40.1 s per paper page**, which is the cost of
running OCR on a photograph.

This cascade runs no OCR. `paper_scores.student_answer` already stores what
the reader produced, so a correction changes the MEANING of a reading that is
already recorded. Re-checking is one indexed UPDATE over the rows whose
reading matches, plus a recount of the papers those rows belong to. There is
no image to open, no page to detect, nothing to re-read.

So what the administrator is starting is a database statement, not a grading
run — and `count_affected()` tells them exactly how many rows and papers it
will touch BEFORE they save it.

THREE LIMITS OF RESCORING FROM THE STORE, STATED RATHER THAN HIDDEN
--------------------------------------------------------------------
Rescoring reads the stored reading instead of the photograph, so:

  * **A true/false reading is stored expanded.** `grader._norm` folds TRUE→T,
    and the 2026-11-19 display fix expands it back, so an item the reader read
    as a bare "T" is stored as "TRUE". A correction keyed on "T" will not
    find it. Key true/false corrections on the word.

  * **A reading is stored at most MAX_ANSWER_LEN characters long.** That is
    100 (app/ml/ocr_identification.py), matching the VARCHAR(100) the column
    has had since 2026-11-02, and grade_paper slices to it - checked against
    the live tree on 2026-11-19. A correction longer than 100 characters
    cannot round-trip, which is why the schema refuses one.

  * **Only papers already checked are affected.** A paper with no
    `paper_scores` rows has never been read, so there is nothing to correct;
    it will pick the correction up the first time it is checked.

AND TWO THINGS THE CASCADE WILL NOT TOUCH
------------------------------------------
  * a row whose `verdict` is 'review'. That row is already flagged for the
    teacher to decide. Rewriting it would remove the very thing they were
    asked to look at. (A row this pass PUTS into review is a different thing:
    it was wrong and silent, and is now visible.)
  * a row whose stored reading is the BLANK glyph, or contains the contested
    separator. Same four refusals as the pass itself.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.ocr_item_numbers import CONTESTED_SEP
from app.ml.grader import BLANK
# ONE definition of "is this answer this key", and it is the application's own.
#
# CHANGED 2026-11-19, and the reason is worth keeping. This used to recompute
# is_correct with `grader._norm(a) == grader._norm(b)` - two states, correct or
# wrong. Fresh grading of an IDENTIFICATION item does not work that way:
# ocr_identification.grade_identification returns three states, and anything
# short of an exact match but above REVIEW_FLOOR (0.40) is handed to the
# teacher rather than marked. The two agreed whenever a correction produced an
# exact match, which is the intended use - and disagreed in one case that
# matters: an item currently WRONG which a correction moves CLOSER to the key
# without reaching it. Fresh grading says "review, a human decides"; the old
# code here said "wrong" and told nobody. That is the exact shape of fault the
# 29 Sep refusal work was written to prevent, so this now calls the real
# function instead of approximating it.
#
# For a SINGLE LETTER this reduces to equality: two distinct characters have
# edit distance 1 over length 1, so similarity is 0.0 - far below the floor.
# Letter items therefore behave exactly as they did, which the bench asserts
# as a control rather than assuming.
from app.ml.ocr_identification import (
    grade_identification, CORRECT as IDENT_CORRECT, REVIEW as IDENT_REVIEW,
)
from app.models.models import (PaperScore, TestPaper, OCRCorrection,
                               OCRCorrectionSample)

# Present only once migrations/2026-11-02_parts_and_answer_length.sql has run.
_HAS_VERDICT = hasattr(PaperScore, "verdict")
REVIEW = "review"


def norm_seen(v: str) -> str:
    """The lookup key. Matches ux_ocr_corrections_seen exactly."""
    return (v or "").strip().upper()


# ============================================================================
# 1. THE PASS.  Pure. Mirrored by measure/2026-11-19_specimen_corrections.py.
# ============================================================================
def apply_corrections(detected, corrections):
    """Rewrite each reading the administrator has taught the system about.

    `corrections` is {normalised seen -> means}. Returns the new `detected`
    and a list of (question, from, to) for the warning.

    FOUR THINGS IT WILL NOT DO, each one a way of inventing marks:

      a BLANK is never corrected. Mapping "" to anything puts an answer on
      every item the student left empty - across a whole class, in one click.

      a CONTESTED reading ("A|B") is never corrected. It is not a reading of
      one mark, and a rule written for a letter has nothing to say about two.

      corrections DO NOT CHAIN. One pass. With "-"->"E" and "E"->"F" in the
      table, a dash becomes E and stops. Chaining would make the result depend
      on row order and could loop.

      a correction to the SAME value changes nothing and is not reported, so
      the warning lists real changes only.
    """
    out = {}
    changed = []
    for q, (letter, conf, page) in detected.items():
        seen = norm_seen(letter)
        if not seen or CONTESTED_SEP in seen:
            out[q] = (letter, conf, page)
            continue
        means = corrections.get(seen)
        if means is None or means == letter:
            out[q] = (letter, conf, page)
            continue
        out[q] = (means, conf, page)
        changed.append((q, letter, means))
    return out, changed


async def active_map(db: AsyncSession) -> dict[str, str]:
    """{normalised seen -> means}, the whole table.

    One small query per paper. The table is administrator-maintained and will
    hold tens of rows, not thousands; caching it would add a staleness window
    for no measurable gain, and a stale correction map is exactly the kind of
    thing that is noticed only at a defence.
    """
    rows = (await db.execute(select(OCRCorrection.seen, OCRCorrection.means))).all()
    return {norm_seen(seen): means for seen, means in rows}


# ============================================================================
# 2. THE CASCADE.
# ============================================================================
@dataclass
class RescoreReport:
    rows_examined:  int = 0
    rows_changed:   int = 0
    rows_skipped_review: int = 0
    papers_touched: int = 0
    marks_gained:   int = 0
    marks_lost:     int = 0
    marks_to_review: int = 0
    paper_ids:      list[int] = field(default_factory=list)

    def sentence(self) -> str:
        if not self.rows_examined:
            return "No paper already checked contains that reading, so nothing was re-checked."
        bits = [f"Re-checked {self.rows_changed} item(s) across {self.papers_touched} paper(s)"]
        if self.marks_gained:
            bits.append(f"{self.marks_gained} became correct")
        if self.marks_lost:
            bits.append(f"{self.marks_lost} became wrong")
        if self.marks_to_review:
            bits.append(f"{self.marks_to_review} now need a teacher's review")
        if self.rows_skipped_review:
            bits.append(f"{self.rows_skipped_review} left alone because they are under review")
        return "; ".join(bits) + "."


# How many rows a preview will judge one at a time before it gives up and
# reports counts only. The full apply of 5,250 rows measured 177 ms, and a
# read-only tally is cheaper - but this runs on a 400 ms debounce while an
# administrator types, so it needs a ceiling rather than a hope.
PREVIEW_CAP = 5000


def judge(means: str, correct_answer: str) -> str:
    """The verdict a row would get. ONE definition, used by preview and apply.

    If these two ever disagree, the number beside the Save button stops
    describing what Save does - which is worse than having no number at all.
    """
    return grade_identification(means, correct_answer)


def _correctable(row: PaperScore) -> bool:
    """The same four refusals as the pass, applied to a stored reading."""
    seen = norm_seen(row.student_answer)
    if not seen or seen == BLANK or CONTESTED_SEP in seen:
        return False
    if _HAS_VERDICT and (getattr(row, "verdict", "") or "").lower() == REVIEW:
        return False
    return True


async def count_affected(db: AsyncSession, seen: str) -> tuple[int, int]:
    """(rows, papers) that a correction of `seen` would re-check.

    Measured BEFORE the administrator saves, so the blast radius is a number
    on the screen rather than a surprise. Selects on exactly the expression
    ix_paper_scores_student_answer indexes.
    """
    key = norm_seen(seen)
    if not key or key == BLANK or CONTESTED_SEP in key:
        return (0, 0)
    row = (await db.execute(
        select(func.count(PaperScore.score_id),
               func.count(func.distinct(PaperScore.paper_id)))
        .where(func.upper(func.trim(PaperScore.student_answer)) == key)
    )).one()
    return (int(row[0] or 0), int(row[1] or 0))


@dataclass
class AffectedPreview:
    """What saving WOULD do. Read-only; writes nothing.

    ADDED 2026-11-19, and the reason is a near miss worth recording. The
    screen used to print "14 items on 6 papers" - true, and no help at all in
    the case that mattered. Production holds 371 items reading `T` across 21
    papers; a correction of `T` to `TRUE` looks obviously right and would have
    marked hundreds of correct answers wrong, because those rows store their
    key folded as `T` too. The old count would have said "371 items on 21
    papers" and nothing else.

    It now says how many would become correct, wrong, or go to review - the
    same judgement the apply uses, run without writing.

    These count TRANSITIONS, not final states, and that distinction was a
    measured failure before it was a design. The first version counted every
    row that would END wrong - so a sound `-` -> `E` correction reported "1
    would become WRONG" because one dash sat on an item whose key is C and
    was already wrong. Crying wolf on the correction you actually want is how
    a warning stops being read. `would_be_wrong` now means what it says: a
    mark that is correct today and would not be.

    They are therefore identical by construction to RescoreReport's
    marks_gained / marks_lost / marks_to_review, which the bench asserts.
    """
    rows:              int = 0
    papers:            int = 0
    skipped_review:    int = 0
    would_be_correct:  int = 0      # == RescoreReport.marks_gained
    would_be_wrong:    int = 0      # == RescoreReport.marks_lost
    would_need_review: int = 0      # == RescoreReport.marks_to_review
    detailed:          bool = True      # False when the row count passed the cap


async def preview_for(db: AsyncSession, seen: str, means: str) -> AffectedPreview:
    """Count the rows, and - unless there are too many - judge each one."""
    pv = AffectedPreview()
    pv.rows, pv.papers = await count_affected(db, seen)
    key = norm_seen(seen)
    if not pv.rows or not (means or "").strip() or key == norm_seen(means):
        return pv
    if pv.rows > PREVIEW_CAP:
        pv.detailed = False
        return pv

    rows = list((await db.execute(
        select(PaperScore)
        .where(func.upper(func.trim(PaperScore.student_answer)) == key)
    )).scalars().all())
    for r in rows:
        if not _correctable(r):
            if _HAS_VERDICT and (getattr(r, "verdict", "") or "").lower() == REVIEW:
                pv.skipped_review += 1
            continue
        was = bool(r.is_correct)
        v = judge(means, r.correct_answer)
        now = v == IDENT_CORRECT
        if now and not was:
            pv.would_be_correct += 1
        elif was and not now:
            pv.would_be_wrong += 1
        if v == IDENT_REVIEW:
            pv.would_need_review += 1
    return pv


async def rescore_for(db: AsyncSession, seen: str, means: str) -> RescoreReport:
    """Re-check every already-checked paper containing the reading `seen`.

    DOES NOT COMMIT. The caller owns the transaction, so a correction row and
    the re-check it caused are saved together or not at all - a correction
    saved without its cascade would leave the table and the scores disagreeing
    with each other, which is worse than either failing.
    """
    rep = RescoreReport()
    key = norm_seen(seen)
    if not key or key == BLANK or CONTESTED_SEP in key or key == norm_seen(means):
        return rep

    rows = list((await db.execute(
        select(PaperScore)
        .where(func.upper(func.trim(PaperScore.student_answer)) == key)
    )).scalars().all())
    rep.rows_examined = len(rows)

    touched: set[int] = set()
    for r in rows:
        if not _correctable(r):
            if _HAS_VERDICT and (getattr(r, "verdict", "") or "").lower() == REVIEW:
                rep.rows_skipped_review += 1
            continue
        was = bool(r.is_correct)
        # The application's own three-state judgement, not a copy of it.
        verdict = judge(means, r.correct_answer)
        now = verdict == IDENT_CORRECT
        r.student_answer = means[:100]
        r.is_correct = now
        if _HAS_VERDICT:
            r.verdict = verdict
        rep.rows_changed += 1
        if now and not was:
            rep.marks_gained += 1
        elif was and not now:
            rep.marks_lost += 1
        if verdict == IDENT_REVIEW:
            rep.marks_to_review += 1
        touched.add(r.paper_id)

    # Recount each touched paper from its own rows rather than adding a delta:
    # a delta is right only if nothing else changed the paper meanwhile, and
    # the recount costs one grouped query.
    if touched:
        counts = dict((await db.execute(
            select(PaperScore.paper_id, func.count(PaperScore.score_id))
            .where(PaperScore.paper_id.in_(touched))
            .where(PaperScore.is_correct.is_(True))
            .group_by(PaperScore.paper_id)
        )).all())
        papers = list((await db.execute(
            select(TestPaper).where(TestPaper.paper_id.in_(touched))
        )).scalars().all())
        for p in papers:
            p.total_score = int(counts.get(p.paper_id, 0))
        rep.papers_touched = len(papers)
        rep.paper_ids = sorted(touched)

    return rep


# ============================================================================
# 3. THE DATASET.  Samples collected from teachers correcting scanned answers.
# ============================================================================
@dataclass
class Suggestion:
    """A pair teachers have corrected, with the weight of evidence behind it."""
    seen:        str = ""
    means:       str = ""
    times:       int = 0
    exams:       int = 0
    papers:      int = 0
    avg_confidence: Optional[float] = None
    last_seen:   Optional[str] = None
    already:     bool = False     # a correction for this reading already exists


def sample_worth_keeping(seen: str, means: str, confidence) -> bool:
    """Is this correction evidence about the READER?

    Four refusals, the same four the correction pass makes, plus one more that
    only applies here:

      `confidence is None` means the value being replaced was typed by a
      person, not produced by the reader - override_answer nulls the
      confidence precisely because the reading no longer stands. Correcting an
      already-corrected item says nothing about the recogniser, and counting
      it would let one teacher's repeated edits manufacture a suggestion.
    """
    if confidence is None:
        return False
    a, b = norm_seen(seen), norm_seen(means)
    if not a or not b or a == b:
        return False
    if a == norm_seen(BLANK) or b == norm_seen(BLANK):
        return False
    if CONTESTED_SEP in a or CONTESTED_SEP in b:
        return False
    return True


def build_sample(score: PaperScore, exam_id: int, means: str,
                 user_id: Optional[int]) -> Optional[OCRCorrectionSample]:
    """The row to record, or None when this correction is not evidence.

    Pure: takes the PaperScore as it stands BEFORE it is overwritten. The
    caller owns the transaction and decides how to insert it - see the
    paper_answer_service hook, which uses a SAVEPOINT so that a failure here
    can never cost a teacher their correction.
    """
    seen = score.student_answer
    if not sample_worth_keeping(seen, means, score.ocr_confidence):
        return None
    return OCRCorrectionSample(
        score_id=score.score_id,
        exam_id=exam_id,
        question_number=score.question_number,
        seen=(seen or "").strip()[:100],
        means=(means or "").strip()[:100],
        confidence=score.ocr_confidence,
        corrected_by=user_id,
    )


async def suggestions(db: AsyncSession, min_times: int = 1) -> list[Suggestion]:
    """What teachers keep correcting, most-corrected first.

    This is the "dataset" half of Alex's points 5 and 6, and it is deliberately
    only a SUGGESTION. Nothing here creates a correction. The administrator
    sees the pair, how many times it has happened, across how many exams, and
    how confident the reader was while being wrong - then decides, with the
    outcome preview in front of them.
    """
    # The expressions are built ONCE and used in both SELECT and GROUP BY.
    # Grouping by the label STRINGS ("seen", "means") looks equivalent and is
    # not: the table has columns of those names, so the strings bound to the
    # raw columns and 't'->'b' came out as a different claim from 'T'->'B'.
    # Measured - the case-variant check in the bench caught it.
    seen_e = func.upper(func.trim(OCRCorrectionSample.seen))
    means_e = func.upper(func.trim(OCRCorrectionSample.means))
    times_e = func.count(OCRCorrectionSample.sample_id)
    rows = (await db.execute(
        select(
            seen_e.label("seen"),
            means_e.label("means"),
            times_e.label("times"),
            func.count(func.distinct(OCRCorrectionSample.exam_id)).label("exams"),
            func.count(func.distinct(OCRCorrectionSample.score_id)).label("papers"),
            func.avg(OCRCorrectionSample.confidence).label("avg_conf"),
            func.max(OCRCorrectionSample.created_at).label("last_seen"),
        )
        .group_by(seen_e, means_e)
        .having(times_e >= min_times)
        .order_by(times_e.desc())
    )).all()

    existing = {norm_seen(k) for k in
                (await db.execute(select(OCRCorrection.seen))).scalars().all()}
    out = []
    for seen, means, times, exams, papers, avg_conf, last_seen in rows:
        out.append(Suggestion(
            seen=seen, means=means, times=int(times), exams=int(exams or 0),
            papers=int(papers or 0),
            avg_confidence=round(float(avg_conf), 2) if avg_conf is not None else None,
            last_seen=last_seen.isoformat() if last_seen else None,
            already=norm_seen(seen) in existing,
        ))
    return out