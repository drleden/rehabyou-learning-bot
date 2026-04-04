"""
Admin / superadmin endpoints.

Covers: organization management, broadcast messages,
        system announcements, audit log, promo code management.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/audit-log")
async def audit_log():
    raise NotImplementedError


@router.post("/announcements")
async def create_announcement():
    raise NotImplementedError


@router.post("/broadcast")
async def broadcast():
    raise NotImplementedError


@router.get("/promo-codes")
async def list_promo_codes():
    raise NotImplementedError


@router.post("/promo-codes")
async def create_promo_code():
    raise NotImplementedError
