"""
Subscription check middleware.

Intercepts requests to /api/learning/ and /api/academy/.
Returns 402 if the organisation's subscription is frozen/expired.

Exceptions (always allowed):
  - superadmin / owner roles
  - trial status (7-day free trial)
  - unauthenticated requests (handled by auth middleware)
"""
import logging
from datetime import datetime, timezone

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy import select

from config import settings
from database import AsyncSessionLocal
from models.users import Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)

GUARDED_PREFIXES = ("/api/learning/", "/api/academy/")
EXEMPT_ROLES     = {"superadmin", "owner"}
ALGORITHM        = "HS256"


def _decode_token(authorization: str | None) -> dict | None:
    """Return JWT payload or None if missing / invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def subscription_check_middleware(request: Request, call_next):
    path = request.url.path

    # Only guard learning/academy routes
    if not any(path.startswith(p) for p in GUARDED_PREFIXES):
        return await call_next(request)

    # Decode JWT (no DB hit yet)
    payload = _decode_token(request.headers.get("Authorization"))
    if payload is None:
        # No token — let auth middleware handle the 401
        return await call_next(request)

    roles = payload.get("roles") or []
    # Superadmin/owner always pass
    if any(r in EXEMPT_ROLES for r in roles):
        return await call_next(request)

    org_id = payload.get("org_id")
    if not org_id:
        # No org — allow (will fail at business logic level)
        return await call_next(request)

    # Check subscription in DB
    try:
        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(Subscription)
                .where(
                    Subscription.org_id == org_id,
                    Subscription.is_active == True,
                )
                .order_by(Subscription.created_at.desc())
                .limit(1)
            )
            sub = row.scalar()
    except Exception as exc:
        logger.error("subscription_check_middleware DB error: %s", exc)
        # DB unavailable — fail open (don't block users)
        return await call_next(request)

    if sub is None:
        # No subscription record → treat as trial, allow
        return await call_next(request)

    status = sub.status or SubscriptionStatus.trial

    # Trial always passes
    if status == SubscriptionStatus.trial:
        return await call_next(request)

    # Check expiry
    now = datetime.now(timezone.utc)
    ends_at = sub.ends_at
    if ends_at:
        if ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)
        if ends_at < now:
            status = SubscriptionStatus.frozen

    if status == SubscriptionStatus.frozen:
        return JSONResponse(
            status_code=402,
            content={
                "detail":  "Подписка приостановлена. Оплатите подписку для доступа к обучению.",
                "code":    "subscription_frozen",
                "action":  "/admin/subscriptions",
            },
        )

    return await call_next(request)
