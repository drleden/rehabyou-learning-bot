"""
Psychological tests endpoints.

GET  /                     — list active tests
GET  /{test_id}            — get test with questions
POST /{test_id}/submit     — submit answers, compute score + interpretation
GET  /results/me           — own results history
GET  /results/{user_id}    — results for a specific user (manager/superadmin)
"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user, require_roles
from models.psych_tests import PsychTest, PsychTestQuestion, PsychTestResult
from models.users import User

router = APIRouter()

MANAGE_ROLES = ("superadmin", "owner", "manager", "admin")

# ── Role / type metadata ──────────────────────────────────────────────────────

BELBIN_ROLES = ["Координатор", "Генератор идей", "Аналитик", "Исполнитель"]

BELBIN_DESCRIPTIONS = {
    "Координатор":    "Вы прирождённый лидер. Умеете организовать команду, распределить задачи и направить всех к общей цели.",
    "Генератор идей": "Вы творческая личность. Генерируете нестандартные идеи и вдохновляете команду на новые решения.",
    "Аналитик":       "Вы стратегический мыслитель. Объективно оцениваете ситуацию, находите слабые места и предлагаете взвешенные решения.",
    "Исполнитель":    "Вы надёжный специалист. Качественно выполняете задачи, внимательны к деталям и всегда доводите дело до конца.",
}

MBTI_DESCRIPTIONS = {
    "INTJ": "Стратег. Независимый и решительный мыслитель с высокими стандартами.",
    "INTP": "Учёный. Логичный и объективный, любит теории и абстрактные идеи.",
    "ENTJ": "Командир. Смелый лидер, всегда находит путь к цели.",
    "ENTP": "Полемист. Умный и любопытный, не упускает интеллектуальный вызов.",
    "INFJ": "Активист. Тихий и мистический, но вдохновляет других своими идеями.",
    "INFP": "Посредник. Поэтичная душа, всегда готова помочь другим.",
    "ENFJ": "Тренер. Харизматичный лидер, умеет вдохновлять и мотивировать.",
    "ENFP": "Борец. Энергичный и творческий, умеет находить общий язык с людьми.",
    "ISTJ": "Администратор. Надёжный и практичный, ценит порядок и традиции.",
    "ISFJ": "Защитник. Заботливый и преданный, всегда готов поддержать других.",
    "ESTJ": "Менеджер. Организованный и целеустремлённый, умеет управлять проектами.",
    "ESFJ": "Консул. Общительный и внимательный, ставит интересы других на первое место.",
    "ISTP": "Виртуоз. Смелый экспериментатор, мастер практических решений.",
    "ISFP": "Артист. Гибкий и привлекательный, всегда открыт новому опыту.",
    "ESTP": "Делец. Умный и энергичный, любит жить на грани риска.",
    "ESFP": "Развлекатель. Спонтанный и энергичный, жизнь — это вечеринка.",
}

# ── Scoring ───────────────────────────────────────────────────────────────────

def _compute_score(test_name: str, questions: list[PsychTestQuestion], answers: list[Any]) -> dict:
    # ── Белбин ────────────────────────────────────────────────────────────────
    # 28 вопросов, 4 варианта: индекс 0-3 → роль
    if test_name == "Белбин":
        scores = {r: 0 for r in BELBIN_ROLES}
        for q, ans in zip(questions, answers):
            opts = q.options or []
            idx = opts.index(ans) if ans in opts else -1
            if 0 <= idx < len(BELBIN_ROLES):
                scores[BELBIN_ROLES[idx]] += 1
        return scores

    # ── MBTI ──────────────────────────────────────────────────────────────────
    # 32 вопроса блоками по 8: EI / SN / TF / JP
    # Вариант 0 → первая буква пары, вариант 1 → вторая
    if test_name == "MBTI":
        SCALES = [("E", "I"), ("S", "N"), ("T", "F"), ("J", "P")]
        counts: dict[str, int] = {c: 0 for pair in SCALES for c in pair}
        for i, (q, ans) in enumerate(zip(questions, answers)):
            scale_idx = i // 8
            if scale_idx >= len(SCALES):
                continue
            letters = SCALES[scale_idx]
            opts = q.options or []
            ans_idx = opts.index(ans) if ans in opts else 0
            letter = letters[min(ans_idx, 1)]
            counts[letter] = counts.get(letter, 0) + 1
        mbti_type = (
            ("E" if counts["E"] >= counts["I"] else "I") +
            ("S" if counts["S"] >= counts["N"] else "N") +
            ("T" if counts["T"] >= counts["F"] else "F") +
            ("J" if counts["J"] >= counts["P"] else "P")
        )
        return {"type": mbti_type, "counts": counts}

    # ── Выгорание ─────────────────────────────────────────────────────────────
    # 16 вопросов, варианты: Никогда(0) Иногда(1) Часто(2) Постоянно(3)
    # Вопросы 11-16 (индексы 10-15) — обратная шкала
    if test_name == "Выгорание":
        SCORE_MAP = {"Никогда": 0, "Иногда": 1, "Часто": 2, "Постоянно": 3}
        total = 0
        for i, (q, ans) in enumerate(zip(questions, answers)):
            raw = SCORE_MAP.get(str(ans), 0)
            score = (3 - raw) if i >= 10 else raw
            total += score
        max_score = len(questions) * 3  # 16 * 3 = 48
        pct = round(total / max_score * 100) if max_score > 0 else 0
        if pct < 25:
            level = "Низкий"
        elif pct < 50:
            level = "Умеренный"
        elif pct < 75:
            level = "Высокий"
        else:
            level = "Критический"
        return {"total": total, "max": max_score, "percent": pct, "level": level}

    return {"answers_count": len(answers)}


# ── Interpretation ────────────────────────────────────────────────────────────

def _interpret_score(test_name: str, raw_score: dict) -> str:
    # ── Белбин ────────────────────────────────────────────────────────────────
    if test_name == "Белбин":
        sorted_roles = sorted(raw_score.items(), key=lambda x: x[1], reverse=True)
        top2 = [(r, s) for r, s in sorted_roles if s > 0][:2]
        if not top2:
            return "Результаты теста не определены."
        lines = ["Ваши ведущие командные роли:"]
        for i, (role, _) in enumerate(top2, 1):
            desc = BELBIN_DESCRIPTIONS.get(role, "")
            lines.append(f"\n{i}. {role}\n{desc}")
        return "\n".join(lines)

    # ── MBTI ──────────────────────────────────────────────────────────────────
    if test_name == "MBTI":
        mbti_type = raw_score.get("type", "")
        desc = MBTI_DESCRIPTIONS.get(mbti_type, "Тип личности определён.")
        return f"Ваш тип личности: {mbti_type} — {desc}"

    # ── Выгорание ─────────────────────────────────────────────────────────────
    if test_name == "Выгорание":
        pct = raw_score.get("percent", 0)
        level = raw_score.get("level", "")
        details = {
            "Низкий":      "Хороший баланс между работой и отдыхом. Продолжайте в том же духе!",
            "Умеренный":   "Стоит обратить внимание на восстановление и отдых.",
            "Высокий":     "Рекомендуется снизить нагрузку и поговорить с руководителем.",
            "Критический": "Необходим полноценный отдых и профессиональная поддержка.",
        }
        THRESHOLDS = {
            "Низкий": "0–25%",
            "Умеренный": "25–50%",
            "Высокий": "50–75%",
            "Критический": "75–100%",
        }
        detail = details.get(level, "")
        threshold = THRESHOLDS.get(level, "")
        return f"Уровень выгорания: {level} ({threshold}) — {pct}%\n\n{detail}"

    return "Тест пройден."


# ── Schemas ───────────────────────────────────────────────────────────────────

class SubmitIn(BaseModel):
    answers: list[Any]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
async def list_tests(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(PsychTest).where(PsychTest.is_active == True).order_by(PsychTest.id)
    )
    tests = rows.scalars().all()
    return [
        {"id": t.id, "name": t.name, "description": t.description}
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
    return [
        {
            "id": r.id,
            "test_id": r.test_id,
            "test_name": t.name,
            "raw_score": json.loads(r.raw_score) if r.raw_score else {},
            "ai_interpretation": r.ai_interpretation,
            "created_at": r.created_at.isoformat(),
        }
        for r, t in rows.all()
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
    return [
        {
            "id": r.id,
            "test_id": r.test_id,
            "test_name": t.name,
            "raw_score": json.loads(r.raw_score) if r.raw_score else {},
            "ai_interpretation": r.ai_interpretation,
            "created_at": r.created_at.isoformat(),
        }
        for r, t in rows.all()
    ]


@router.get("/{test_id}")
async def get_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
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
    return {
        "id": test.id,
        "name": test.name,
        "description": test.description,
        "questions": [
            {"id": q.id, "question": q.question, "options": q.options, "position": q.position}
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
            detail=f"Ожидается {len(questions)} ответов, получено {len(body.answers)}",
        )

    raw_score = _compute_score(test.name, questions, body.answers)
    interpretation = _interpret_score(test.name, raw_score)

    result = PsychTestResult(
        user_id=actor.id,
        test_id=test_id,
        answers=json.dumps(body.answers, ensure_ascii=False),
        raw_score=json.dumps(raw_score, ensure_ascii=False),
        ai_interpretation=interpretation,
        ai_model_used=None,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)

    return {
        "id": result.id,
        "test_name": test.name,
        "raw_score": raw_score,
        "ai_interpretation": interpretation,
        "created_at": result.created_at.isoformat(),
    }
