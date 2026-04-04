"""
Claude API service (Anthropic).

Responsibilities:
1. Check assignment answers (min 50 words, relevance, coherence)
2. AI assistant chat for managers/owners (platform context only)
3. Generate weekly/on-demand AI digest for superadmin/owner
4. Interpret psychological test results per role
"""
from anthropic import AsyncAnthropic

from config import settings

client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

SYSTEM_PROMPT_ASSISTANT = """
Ты ИИ-ассистент образовательной платформы Rehab.You.
Ты помогаешь управляющим и владельцам студий только по вопросам,
связанным с обучением сотрудников: статистика прохождения курсов,
посещаемость академии, прогресс новичков, результаты тестов.
Отвечай кратко, по делу, на русском языке.
Не отвечай на вопросы, не связанные с платформой обучения.
"""


async def check_assignment(assignment_text: str, lesson_topic: str) -> dict:
    """
    Check a practical assignment answer via Claude.

    Returns:
        {"status": "accepted"|"rejected", "comment": str}
    """
    word_count = len(assignment_text.split())
    if word_count < 50:
        return {
            "status": "rejected",
            "comment": f"Ответ слишком короткий ({word_count} слов). Минимум — 50 слов.",
        }

    prompt = f"""
Тема задания: {lesson_topic}

Ответ ученика:
{assignment_text}

Оцени ответ по следующим критериям:
1. Соответствует ли ответ теме задания?
2. Осмысленный ли текст (не случайный набор слов)?

Ответь строго в формате JSON:
{{"status": "accepted" | "rejected", "comment": "<причина на русском>"}}
"""

    message = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    return json.loads(message.content[0].text)


async def chat(messages: list[dict], user_context: dict) -> str:
    """
    AI assistant chat.

    Args:
        messages: list of {"role": "user"|"assistant", "content": str}
        user_context: dict with branch/org stats injected as system context
    """
    system = SYSTEM_PROMPT_ASSISTANT + "\n\nКонтекст:\n" + str(user_context)

    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    return response.content[0].text


async def generate_digest(stats: dict) -> str:
    """
    Generate an AI digest from aggregated statistics.

    Args:
        stats: dict with learning progress, attendance, test results, etc.
    """
    prompt = f"""
Создай структурированную еженедельную сводку по обучению сотрудников.
Используй только предоставленные данные. Язык: русский.

Данные:
{stats}

Структура ответа:
1. Кто прошёл / не прошёл курсы за период
2. Кто не заходил и как давно
3. Результаты тестов и аттестаций
4. Проблемные зоны
5. Рекомендации
"""
    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


async def interpret_psych_test(raw_score: dict, role: str, test_name: str) -> str:
    """
    Generate a role-specific interpretation of a psychological test result.

    Args:
        raw_score: computed subscale scores
        role: user's primary role (master / senior_master / manager / owner)
        test_name: e.g. "Белбин", "MBTI", "Выгорание"
    """
    prompt = f"""
Тест: {test_name}
Должность сотрудника: {role}
Результаты по шкалам: {raw_score}

Составь интерпретацию результата для руководителя.
Структура:
1. Сильные стороны в контексте должности
2. Зоны роста / риски
3. Практические рекомендации для руководителя

Язык: русский. Тон: профессиональный, конструктивный.
"""
    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text
