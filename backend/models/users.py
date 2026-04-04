"""
User-related database models.

Tables: organizations, branches, users, subscriptions, promo_codes,
        notifications, badges, user_badges, audit_log,
        system_announcements, offline_cache_meta
"""
import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    owner = "owner"
    manager = "manager"
    senior_master = "senior_master"
    teacher = "teacher"
    master = "master"
    admin = "admin"


class UserStatus(str, enum.Enum):
    active = "active"
    fired = "fired"
    blocked = "blocked"
    trial = "trial"


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    branches = relationship("Branch", back_populates="organization")
    users = relationship("User", back_populates="organization")


class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    city = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="branches")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, index=True)
    phone = Column(String(20), nullable=False)
    first_name = Column(String(100))
    last_name = Column(String(100))
    username = Column(String(100))
    org_id = Column(Integer, ForeignKey("organizations.id"))
    # roles and branch_ids stored as ARRAY for multi-role / multi-branch support
    roles = Column(ARRAY(String), nullable=False, default=list)
    branch_ids = Column(ARRAY(Integer), nullable=False, default=list)
    status = Column(Enum(UserStatus), nullable=False, default=UserStatus.trial)
    yclients_staff_id = Column(String(100))
    bitrix_user_id = Column(String(100))
    hired_at = Column(DateTime(timezone=True))
    fired_at = Column(DateTime(timezone=True))
    last_active_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="users")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    plan_name = Column(String(100))
    max_users = Column(Integer)
    price = Column(Integer)  # kopecks
    starts_at = Column(DateTime(timezone=True))
    ends_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    is_used = Column(Boolean, default=False)
    used_by = Column(Integer, ForeignKey("users.id"))
    used_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String(100), nullable=False)
    payload = Column(Text)
    is_sent = Column(Boolean, default=False)
    scheduled_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Badge(Base):
    __tablename__ = "badges"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    icon_url = Column(String(500))
    condition_type = Column(String(100))  # module_complete, course_complete, etc.
    condition_value = Column(String(255))


class UserBadge(Base):
    __tablename__ = "user_badges"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    badge_id = Column(Integer, ForeignKey("badges.id"), nullable=False)
    awarded_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, ForeignKey("users.id"))
    target_user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String(255), nullable=False)
    details = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SystemAnnouncement(Base):
    __tablename__ = "system_announcements"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    target_roles = Column(ARRAY(String))
    target_org_id = Column(Integer, ForeignKey("organizations.id"))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OfflineCacheMeta(Base):
    """Metadata for offline mode — reserved for v2."""
    __tablename__ = "offline_cache_meta"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    resource_type = Column(String(100))
    resource_id = Column(Integer)
    cached_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
