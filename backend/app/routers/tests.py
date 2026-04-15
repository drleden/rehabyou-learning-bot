from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.course import Course, Module
from app.models.lesson import Lesson, LessonProgress, LessonProgressStatus
from app.models.test import Test, TestAnswer, TestAttempt, TestQuestion
from app.models.user import User, UserRole
from app.utils.notify import notify_bot
from app.schemas.test import (
    TestAnswerCreate,
    TestAnswerOut,
    TestAnswerInQuestion,
    TestAttemptOut,
    TestCreate,
    TestFull,
    TestFullCreate,
    TestOut,
    TestQuestionCreate,
    TestQuestionFull,
    TestQuestionOut,
    TestSubmit,
    TestUpdate,
)

router = APIRouter(prefix="/tests", tags=["tests"])


@router.get("/by-lesson/{lesson_id}/full", response_model=TestFull | None)
async def get_test_full_by_lesson(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Test).where(Test.lesson_id == lesson_id))
    test = result.scalar_one_or_none()
    if test is None:
        return None
    q_res = await db.execute(
        select(TestQuestion).where(TestQuestion.test_id == test.id).order_by(TestQuestion.order_index)
    )
    questions = q_res.scalars().all()
    q_out = []
    for q in questions:
        a_res = await db.execute(select(TestAnswer).where(TestAnswer.question_id == q.id))
        answers = [TestAnswerInQuestion.model_validate(a) for a in a_res.scalars().all()]
        q_out.append(TestQuestionFull(**TestQuestionOut.model_validate(q).model_dump(), answers=answers))
    return TestFull(**TestOut.model_validate(test).model_dump(), questions=q_out)


@router.post("/full", response_model=TestOut, status_code=status.HTTP_201_CREATED)
async def create_test_full(
    body: TestFullCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    test = Test(lesson_id=body.lesson_id, pass_threshold=body.pass_threshold)
    db.add(test)
    await db.flush()
    for q_data in body.questions:
        q = TestQuestion(test_id=test.id, question_text=q_data.question_text, order_index=q_data.order_index)
        db.add(q)
        await db.flush()
        for a_data in q_data.answers:
            a = TestAnswer(question_id=q.id, answer_text=a_data.answer_text, is_correct=a_data.is_correct)
            db.add(a)
    await db.commit()
    await db.refresh(test)
    return TestOut.model_validate(test)


@router.get("/by-lesson/{lesson_id}", response_model=TestOut | None)
async def get_test_by_lesson(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Test).where(Test.lesson_id == lesson_id))
    test = result.scalar_one_or_none()
    if test is None:
        return None
    return TestOut.model_validate(test)


@router.post("/", response_model=TestOut, status_code=status.HTTP_201_CREATED)
async def create_test(
    body: TestCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    test = Test(**body.model_dump())
    db.add(test)
    await db.commit()
    await db.refresh(test)
    return TestOut.model_validate(test)


@router.patch("/{test_id}", response_model=TestOut)
async def update_test(
    test_id: int,
    body: TestUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(test, field, value)

    await db.commit()
    await db.refresh(test)
    return TestOut.model_validate(test)


# --- Questions ---

@router.get("/{test_id}/questions", response_model=list[TestQuestionOut])
async def list_questions(
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TestQuestion).where(TestQuestion.test_id == test_id).order_by(TestQuestion.order_index)
    )
    return [TestQuestionOut.model_validate(q) for q in result.scalars().all()]


@router.post("/questions", response_model=TestQuestionOut, status_code=status.HTTP_201_CREATED)
async def create_question(
    body: TestQuestionCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    q = TestQuestion(**body.model_dump())
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return TestQuestionOut.model_validate(q)


# --- Answers ---

@router.get("/questions/{question_id}/answers", response_model=list[TestAnswerOut])
async def list_answers(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TestAnswer).where(TestAnswer.question_id == question_id)
    )
    return [TestAnswerOut.model_validate(a) for a in result.scalars().all()]


@router.post("/answers", response_model=TestAnswerOut, status_code=status.HTTP_201_CREATED)
async def create_answer(
    body: TestAnswerCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    a = TestAnswer(**body.model_dump())
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return TestAnswerOut.model_validate(a)


# --- Attempts (submit test) ---

@router.post("/{test_id}/submit", response_model=TestAttemptOut)
async def submit_test(
    test_id: int,
    body: TestSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    test_res = await db.execute(select(Test).where(Test.id == test_id))
    test = test_res.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    # Get all questions for this test
    q_res = await db.execute(select(TestQuestion).where(TestQuestion.test_id == test_id))
    questions = q_res.scalars().all()
    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test has no questions")

    # Get correct answers
    q_ids = [q.id for q in questions]
    a_res = await db.execute(
        select(TestAnswer).where(TestAnswer.question_id.in_(q_ids), TestAnswer.is_correct.is_(True))
    )
    correct_map = {a.question_id: a.id for a in a_res.scalars().all()}

    # Calculate score
    correct_count = 0
    for q in questions:
        user_answer = body.answers.get(str(q.id))
        if user_answer and correct_map.get(q.id) == int(user_answer):
            correct_count += 1

    score = round(correct_count / len(questions) * 100)
    passed = score >= test.pass_threshold

    attempt = TestAttempt(
        user_id=current_user.id,
        test_id=test_id,
        score=score,
        passed=passed,
        answers_snapshot=body.answers,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    # Notifications
    if current_user.telegram_id:
        if not passed:
            await notify_bot({
                "type": "test_failed",
                "telegram_id": current_user.telegram_id,
                "first_name": current_user.first_name,
                "score": score,
                "threshold": test.pass_threshold,
            })
        else:
            # Check if all lessons in course are completed → course_completed
            lesson_res = await db.execute(select(Lesson).where(Lesson.id == test.lesson_id))
            lesson = lesson_res.scalar_one_or_none()
            if lesson:
                mod_res = await db.execute(select(Module).where(Module.id == lesson.module_id))
                module = mod_res.scalar_one_or_none()
                if module:
                    # Count lessons in course
                    all_lessons_res = await db.execute(
                        select(Lesson.id)
                        .join(Module, Lesson.module_id == Module.id)
                        .where(Module.course_id == module.course_id)
                    )
                    all_lesson_ids = [r[0] for r in all_lessons_res.all()]
                    completed_res = await db.execute(
                        select(LessonProgress.lesson_id)
                        .where(
                            LessonProgress.user_id == current_user.id,
                            LessonProgress.lesson_id.in_(all_lesson_ids),
                            LessonProgress.status == LessonProgressStatus.completed,
                        )
                    )
                    completed_ids = {r[0] for r in completed_res.all()}
                    if set(all_lesson_ids).issubset(completed_ids):
                        course_res = await db.execute(select(Course).where(Course.id == module.course_id))
                        course = course_res.scalar_one_or_none()
                        if course:
                            await notify_bot({
                                "type": "course_completed",
                                "telegram_id": current_user.telegram_id,
                                "first_name": current_user.first_name,
                                "course_title": course.title,
                            })

    return TestAttemptOut.model_validate(attempt)


@router.get("/{test_id}/attempts", response_model=list[TestAttemptOut])
async def list_my_attempts(
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TestAttempt)
        .where(TestAttempt.test_id == test_id, TestAttempt.user_id == current_user.id)
        .order_by(TestAttempt.created_at.desc())
    )
    return [TestAttemptOut.model_validate(a) for a in result.scalars().all()]
