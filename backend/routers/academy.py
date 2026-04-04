"""
Academy (новички) endpoints.

Covers: schedule, enrollments, attendance, absence notices,
        materials, novice journal, feedback, attestations,
        skip-counter management.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/schedule")
async def list_schedule():
    raise NotImplementedError


@router.post("/schedule")
async def create_lesson():
    raise NotImplementedError


@router.post("/schedule/{schedule_id}/enroll")
async def enroll(schedule_id: int):
    raise NotImplementedError


@router.post("/schedule/{schedule_id}/attendance")
async def record_attendance(schedule_id: int):
    raise NotImplementedError


@router.post("/schedule/{schedule_id}/absence")
async def report_absence(schedule_id: int):
    raise NotImplementedError


@router.get("/novice/{user_id}/journal")
async def get_novice_journal(user_id: int):
    raise NotImplementedError


@router.post("/attestations")
async def request_attestation():
    raise NotImplementedError


@router.patch("/attestations/{attestation_id}")
async def update_attestation(attestation_id: int):
    raise NotImplementedError


@router.post("/skips/{user_id}/reset")
async def reset_skip_counter(user_id: int):
    raise NotImplementedError
