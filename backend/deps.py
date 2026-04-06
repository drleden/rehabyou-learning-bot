import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.users import User, UserStatus

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer()

# ── JWT ──────────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(minutes=30)
REFRESH_TOKEN_TTL = timedelta(days=7)


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "tg": user.telegram_id,
        "roles": user.roles,
        "branch_ids": user.branch_ids,
        "org_id": user.org_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + ACCESS_TOKEN_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + REFRESH_TOKEN_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


# ── Telegram WebApp initData validation ──────────────────────────────────────

def validate_telegram_init_data(init_data: str) -> dict:
    """
    Validate Telegram Mini App initData per official spec.
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

    Returns parsed payload dict (without hash) if valid.
    Raises HTTPException 401 if invalid.
    """
    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)

    if not received_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing hash in Telegram initData",
        )

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )

    secret_key = hmac.new(
        b"WebAppData",
        settings.TELEGRAM_BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()

    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram initData signature is invalid",
        )

    # auth_date freshness check (max 1 hour)
    auth_date = int(parsed.get("auth_date", 0))
    age = datetime.now(timezone.utc).timestamp() - auth_date
    if age > 3600:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram initData has expired (older than 1 hour)",
        )

    # Decode nested 'user' JSON string
    if "user" in parsed:
        parsed["user"] = json.loads(parsed["user"])

    return parsed


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected access token",
        )

    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.status in (UserStatus.fired, UserStatus.blocked):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status.value}",
        )

    return user


def require_roles(*roles: str):
    """
    Dependency factory for role-based access control.

    Usage:
        @router.get("/admin-only")
        async def admin(user = Depends(require_roles("superadmin", "owner"))):
            ...
    """
    async def _check(user: User = Depends(get_current_user)) -> User:
        if not any(r in user.roles for r in roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required roles: {list(roles)}",
            )
        return user
    return _check
