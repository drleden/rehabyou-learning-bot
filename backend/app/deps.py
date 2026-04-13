from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.utils.auth import decode_access_token

bearer_scheme = HTTPBearer()

ROLE_HIERARCHY = [
    UserRole.novice,
    UserRole.master,
    UserRole.senior_master,
    UserRole.teacher,
    UserRole.manager,
    UserRole.owner,
    UserRole.superadmin,
]


def _role_index(role: UserRole) -> int:
    return ROLE_HIERARCHY.index(role)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is blocked")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is deactivated")

    return user


def require_role(minimum_role: UserRole):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if _role_index(current_user.role) < _role_index(minimum_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {minimum_role.value} or higher required",
            )
        return current_user

    return _check
