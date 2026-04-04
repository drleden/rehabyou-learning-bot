"""
Analytics endpoints.

Covers: network-wide stats (owner/superadmin), branch stats (manager+),
        course conversion, academy progress.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/network")
async def network_stats():
    """Network-wide statistics — superadmin / owner only."""
    raise NotImplementedError


@router.get("/branch/{branch_id}")
async def branch_stats(branch_id: int):
    raise NotImplementedError


@router.get("/courses/conversion")
async def course_conversion():
    raise NotImplementedError


@router.get("/academy/progress")
async def academy_progress():
    raise NotImplementedError
