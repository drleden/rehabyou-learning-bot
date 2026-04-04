"""
Service permissions endpoints.

Covers: list services, grant/revoke permission, permission history.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_services():
    raise NotImplementedError


@router.post("/{service_id}/grant/{user_id}")
async def grant_permission(service_id: int, user_id: int):
    raise NotImplementedError


@router.post("/{service_id}/revoke/{user_id}")
async def revoke_permission(service_id: int, user_id: int):
    raise NotImplementedError


@router.get("/users/{user_id}/permissions")
async def user_permissions(user_id: int):
    raise NotImplementedError
