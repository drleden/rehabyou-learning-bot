"""
Psychological tests endpoints.

Covers: list tests, submit answers, get results (manager/owner only).
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_tests():
    raise NotImplementedError


@router.post("/{test_id}/submit")
async def submit_test(test_id: int):
    """Submit answers; triggers AI interpretation."""
    raise NotImplementedError


@router.get("/results/{user_id}")
async def get_results(user_id: int):
    """Only accessible by superadmin / owner / manager."""
    raise NotImplementedError
