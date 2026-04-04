"""
Online learning endpoints.

Covers: courses, modules, lessons, tests, test attempts,
        assignments, progress tracking, questions.
"""
from fastapi import APIRouter

router = APIRouter()


# ── Courses ──────────────────────────────────────────────────────────
@router.get("/")
async def list_courses():
    raise NotImplementedError


@router.post("/")
async def create_course():
    raise NotImplementedError


@router.get("/{course_id}")
async def get_course(course_id: int):
    raise NotImplementedError


# ── Modules ──────────────────────────────────────────────────────────
@router.post("/{course_id}/modules")
async def create_module(course_id: int):
    raise NotImplementedError


# ── Lessons ──────────────────────────────────────────────────────────
@router.post("/modules/{module_id}/lessons")
async def create_lesson(module_id: int):
    raise NotImplementedError


@router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: int):
    """Returns lesson content + presigned video URL if applicable."""
    raise NotImplementedError


# ── Tests ─────────────────────────────────────────────────────────────
@router.post("/lessons/{lesson_id}/test/submit")
async def submit_test(lesson_id: int):
    raise NotImplementedError


# ── Assignments ───────────────────────────────────────────────────────
@router.post("/lessons/{lesson_id}/assignment/submit")
async def submit_assignment(lesson_id: int):
    raise NotImplementedError


# ── Progress ──────────────────────────────────────────────────────────
@router.get("/progress/me")
async def my_progress():
    raise NotImplementedError
