"""
Service permissions database models.

Tables: services, user_service_permissions, service_permission_history
"""
import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class PermissionStatus(str, enum.Enum):
    permitted = "permitted"
    not_permitted = "not_permitted"


# v1 fixed list — managed via DB seed
SERVICE_LIST = [
    "Классический массаж",
    "Спортивный массаж",
    "Релакс массаж",
    "Антицеллюлитный массаж",
    "Массаж лица",
    "Тейпирование",
    "Стоун-массаж (камни)",
]


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    permissions = relationship("UserServicePermission", back_populates="service")


class UserServicePermission(Base):
    __tablename__ = "user_service_permissions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    status = Column(Enum(PermissionStatus), nullable=False, default=PermissionStatus.not_permitted)
    granted_by = Column(Integer, ForeignKey("users.id"))
    granted_at = Column(DateTime(timezone=True))
    revoked_by = Column(Integer, ForeignKey("users.id"))
    revoked_at = Column(DateTime(timezone=True))

    service = relationship("Service", back_populates="permissions")
    history = relationship("ServicePermissionHistory", back_populates="permission")


class ServicePermissionHistory(Base):
    __tablename__ = "service_permission_history"

    id = Column(Integer, primary_key=True)
    permission_id = Column(Integer, ForeignKey("user_service_permissions.id"), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    old_status = Column(Enum(PermissionStatus))
    new_status = Column(Enum(PermissionStatus), nullable=False)
    reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    permission = relationship("UserServicePermission", back_populates="history")
