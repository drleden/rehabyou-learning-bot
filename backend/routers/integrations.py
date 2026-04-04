"""
Integrations endpoints.

Covers: integration config CRUD, manual sync trigger, logs.
Reserved for v2 — stub only in v1.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_integrations():
    raise NotImplementedError


@router.patch("/{integration_id}")
async def update_integration(integration_id: int):
    raise NotImplementedError


@router.post("/{integration_id}/sync")
async def trigger_sync(integration_id: int):
    raise NotImplementedError


@router.get("/logs")
async def integration_logs():
    raise NotImplementedError
