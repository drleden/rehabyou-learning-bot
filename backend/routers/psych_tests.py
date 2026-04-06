"""
Psychological tests endpoints.

GET  /                         — list active tests (all auth users)
GET  /{test_id}                — get test with questions
POST /{test_id}/submit         — submit answers, compute raw_score, AI interpretation
GET  /results/me               — own results history
GET  /results/{user_id}        — results for a specific user (manager/superadmin)
GET  /seed                     — seed default tests if table empty (superadmin)
"""
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user, require_roles
from models.psych_tests import PsychTest, PsychTestQuestion, PsychTestResult
from models.users import User
from services import ai_service

logger = logging.getLogger(__name__)

router = APIRouter()

MANAGE_ROLES = ("superadmin", "owner", "manager", "admin")

# ── Seed data ─────────────────────────────────────────────────────────────────

BELBIN_QUESTIONS = [
    ("Мне легко взять на себя роль лидера и организовать работу группы.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Я часто генерирую новые идеи и предложения.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Мне важно доводить любое дело до конца, проверяя детали.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Я умею находить нужных людей и налаживать внешние контакты.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Я предпочитаю анализировать варианты прежде чем принимать решение.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Мне легко сотрудничать с другими и поддерживать командный дух.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Я предпочитаю конкретные задачи и чёткие инструкции.", ["Совершенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
    ("Я быстро замечаю проблемы и указываю на ошибки в планах.", ["Совергенно не согласен", "Не согласен", "Нейтрально", "Согласен", "Полностью согласен"]),
]

MBTI_QUESTIONS = [
    ("В компании малознакомых людей вы обычно:", ["Легко вступаете в разговор и чувствуете прилив сил", "Предпочитаете наблюдать и вступать в разговор избирательно"]),
    ("При планировании дел вы:", ["Предпочитаете чёткий план и придерживаетесь его", "Оставляете место для гибкости и корректировок"]),
    ("Принимая решения, вы опираетесь прежде всего на:", ["Логику и объективные факты", "Ценности и влияние на людей"]),
    ("Вы больше доверяете:", ["Конкретным фактам и опыту", "Интуиции и будущим возможностям"]),
    ("В конфликтной ситуации вы:", ["Стараетесь найти справедливое решение по правилам", "Стараетесь сохранить отношения и найти компромисс"]),
    ("Ваш стол и рабочее место обычно:", ["Организованы и всё на своём месте", "Слегка в беспорядке — вы знаете где что лежит"]),
    ("После насыщенного дня общения вы:", ["Чувствуете подъём энергии", "Нуждаетесь в тишине и одиночестве"]),
    ("Вы предпочитаете задачи, которые:", ["Имеют чёткий алгоритм решения", "Требуют творческого подхода и нестандартного мышления"]),
]

BURNOUT_QUESTIONS = [
    ("Насколько часто вы чувствуете физическое истощение после рабочего дня?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("У вас бывают трудности с концентрацией на работе?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("Вы чувствуете, что теряете интерес к своей профессиональной деятельности?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("Вам бывает трудно настроиться на работу с клиентами?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("Вы замечаете у себя раздражительность или цинизм по отношению к работе?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("Вы чувствуете, что ваши усилия не ценятся должным образом?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("У вас есть ощущение, что вы не справляетесь с объёмом задач?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("Вам трудно «переключиться» с работы в нерабочее время?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("У вас бывают нарушения сна из-за мыслей о работе?", ["Никогда", "Редко", "Иногда", "Часто", "Всегда"]),
    ("Вы чувствуете удовлетворение от своей работы?", ["Всегда", "Часто", "Иногда", "Редко", "Никогда"]),
]

TESTS_SEED = [
    {
        "name": "Белбин",
        "description": "Тест командных ролей Мередита Белбина. Выявляет предпочтительную роль сотрудника в команде: организатор, генератор идей, аналитик, исполнитель и др.",
        "questions": BELBIN_QUESTIONS,
    },
    {
        "name": "MBTI",
        "description": "Типологический индикатор Майерс-Бриггс. Определяет тип личности по 4 шкалам: интроверт/экстраверт, сенсорика/интуиция, логика/этика, рациональность/иррациональность.",
        "questions": MBTI_QUESTIONS,
    },
    {
        "name": "Выгорание",
        "description": "Опросник профессионального выгорания. Диагностирует уровень эмоционального истощения и помогает выявить сотрудников в зоне риска.",
        "questions": BURNOUT_QUESTIONS,
    },
]


async def _ensure_seeded(db: AsyncSession) -> None:
    existing = await db.scalar(select(PsychTest).limit(1))
    if existing:
        return
    for t in TESTS_SEED:
        test = PsychTest(name=t["name"], description=t["description"])
        db.add(test)
        await db.flush()
        for pos, (q_text, options) in enumerate(t["questions"]):
            db.add(PsychTestQuestion(
                test_id=test.id,
                question=q_text,
                options=options,
                position=pos,
            ))
    await db.commit()


# ── Raw score computation ─────────────────────────────────────────────────────

def _compute_score(test_name: str, questions: list[PsychTestQuestion], answers: list[Any]) -> dict:
    """
    Simple scoring per test type.
    answers: list aligned to questions (same index).
    """
    if test_name == "Белбин":
        roles = ["Организатор", "Генератор идей", "Финишёр", "Исследователь", "Аналитик", "Командный игрок", "Исполнитель", "Критик"]
        scores = {}
        for i, (q, ans) in enumerate(zip(questions, answers)):
            # answer is the option text; map to 1-5 score by position in options list
            opts = q.options or []
            score = (opts.index(ans) + 1) if ans in opts else 3
            role = roles[i] if i < len(roles) else f"Роль {i+1}"
            scores[role] = score
        return scores

    if test_name == "MBTI":
        # Each question maps to a dimension; answer index 0 = first letter, 1 = second
        dims = [("E", "I"), ("J", "P"), ("T", "F"), ("S", "N"), ("T", "F"), ("J", "P"), ("I", "E"), ("S", "N")]
        counts: dict[str, int] = {"E": 0, "I": 0, "S": 0, "N": 0, "T": 0, "F": 0, "J": 0, "P": 0}
        for i, (q, ans) in enumerate(zip(questions, answers)):
            opts = q.options or []
            idx = opts.index(ans) if ans in opts else 0
            dim = dims[i] if i < len(dims) else ("E", "I")
            letter = dim[idx] if idx < 2 else dim[0]
            counts[letter] = counts.get(letter, 0) + 1
        mbti_type = (
            ("E" if counts["E"] >= counts["I"] else "I") +
            ("S" if counts["S"] >= counts["N"] else "N") +
            ("T" if counts["T"] >= counts["F"] else "F") +
            ("J" if counts["J"] >= counts["P"] else "P")
        )
        return {"type": mbti_type, "counts": counts}

    if test_name == "Выгорание":
        # 5-point scale where higher = more burnout (last q is reversed)
        total = 0
        for i, (q, ans) in enumerate(zip(questions, answers)):
            opts = q.options or []
            score = (opts.index(ans) + 1) if ans in opts else 3
            total += score
        max_score = len(questions) * 5
        pct = round(total / max_score * 100)
        if pct < 30:
            level = "Низкий"
        elif pct < 55:
            level = "Умеренный"
        elif pct < 75:
            level = "Высокий"
        else:
            level = "Критический"
        return {"total": total, "max": max_score, "percent": pct, "level": level}

    # Generic: just count answers
    return {"answers_count": len(answers)}


# ── Schemas ───────────────────────────────────────────────────────────────────

class SubmitIn(BaseModel):
    answers: list[Any]  # ordered list matching question positions


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
async def list_tests(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _ensure_seeded(db)
    rows = await db.execute(select(PsychTest).where(PsychTest.is_active == True).order_by(PsychTest.id))
    tests = rows.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
        }
        for t in tests
    ]


@router.get("/results/me")
async def get_my_results(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(PsychTestResult, PsychTest)
        .join(PsychTest, PsychTestResult.test_id == PsychTest.id)
        .where(PsychTestResult.user_id == actor.id)
        .order_by(PsychTestResult.created_at.desc())
    )
    results = rows.all()
    return [
        {
            "id": r.id,
            "test_id": r.test_id,
            "test_name": t.name,
            "raw_score": json.loads(r.raw_score) if r.raw_score else {},
            "ai_interpretation": r.ai_interpretation,
            "created_at": r.created_at.isoformat(),
        }
        for r, t in results
    ]


@router.get("/results/{user_id}")
async def get_user_results(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    rows = await db.execute(
        select(PsychTestResult, PsychTest)
        .join(PsychTest, PsychTestResult.test_id == PsychTest.id)
        .where(PsychTestResult.user_id == user_id)
        .order_by(PsychTestResult.created_at.desc())
    )
    results = rows.all()
    return [
        {
            "id": r.id,
            "test_id": r.test_id,
            "test_name": t.name,
            "raw_score": json.loads(r.raw_score) if r.raw_score else {},
            "ai_interpretation": r.ai_interpretation,
            "created_at": r.created_at.isoformat(),
        }
        for r, t in results
    ]


@router.get("/{test_id}")
async def get_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _ensure_seeded(db)
    test = await db.get(PsychTest, test_id)
    if not test or not test.is_active:
        raise HTTPException(status_code=404, detail="Test not found")
    rows = await db.execute(
        select(PsychTestQuestion)
        .where(PsychTestQuestion.test_id == test_id)
        .order_by(PsychTestQuestion.position)
    )
    questions = rows.scalars().all()
    return {
        "id": test.id,
        "name": test.name,
        "description": test.description,
        "questions": [
            {
                "id": q.id,
                "question": q.question,
                "options": q.options,
                "position": q.position,
            }
            for q in questions
        ],
    }


@router.post("/{test_id}/submit")
async def submit_test(
    test_id: int,
    body: SubmitIn,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    test = await db.get(PsychTest, test_id)
    if not test or not test.is_active:
        raise HTTPException(status_code=404, detail="Test not found")

    rows = await db.execute(
        select(PsychTestQuestion)
        .where(PsychTestQuestion.test_id == test_id)
        .order_by(PsychTestQuestion.position)
    )
    questions = rows.scalars().all()

    if len(body.answers) != len(questions):
        raise HTTPException(
            status_code=422,
            detail=f"Expected {len(questions)} answers, got {len(body.answers)}",
        )

    raw_score = _compute_score(test.name, questions, body.answers)
    role = (actor.roles[0] if actor.roles else "master")

    try:
        ai_interp = await ai_service.interpret_psych_test(
            raw_score=raw_score,
            role=role,
            test_name=test.name,
        )
        ai_model = "claude-sonnet-4-6"
    except Exception as e:
        logger.warning("AI interpretation failed: %s", e)
        ai_interp = "ИИ-интерпретация временно недоступна. Ваши ответы сохранены."
        ai_model = None

    result = PsychTestResult(
        user_id=actor.id,
        test_id=test_id,
        answers=json.dumps(body.answers, ensure_ascii=False),
        raw_score=json.dumps(raw_score, ensure_ascii=False),
        ai_interpretation=ai_interp,
        ai_model_used=ai_model,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)

    return {
        "id": result.id,
        "test_name": test.name,
        "raw_score": raw_score,
        "ai_interpretation": ai_interp,
        "created_at": result.created_at.isoformat(),
    }
