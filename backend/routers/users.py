"""
User management endpoints.

Covers: profile, role management, onboarding, employee CRUD,
        search within branch/org, skip-counter reset.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/me")
async def get_me():
    raise NotImplementedError


@router.get("/{user_id}")
async def get_user(user_id: int):
    raise NotImplementedError


@router.post("/")
async def create_user():
    raise NotImplementedError


@router.patch("/{user_id}")
async def update_user(user_id: int):
    raise NotImplementedError


@router.post("/{user_id}/fire")
async def fire_user(user_id: int):
    raise NotImplementedError


@router.post("/{user_id}/roles")
async def assign_role(user_id: int):
    raise NotImplementedError
