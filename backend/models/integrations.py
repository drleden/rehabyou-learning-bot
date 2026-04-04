"""
Integration and AI database models.

Tables: integration_configs, integration_logs, yclients_sync_cache,
        ai_conversations, ai_reports, ai_digest_settings
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


class IntegrationType(str, enum.Enum):
    yclients = "yclients"
    bitrix24 = "bitrix24"
    analytics = "analytics"


class IntegrationConfig(Base):
    __tablename__ = "integration_configs"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    integration_type = Column(Enum(IntegrationType), nullable=False)
    config = Column(Text)  # JSON: tokens, endpoints, etc.
    is_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class IntegrationLog(Base):
    __tablename__ = "integration_logs"

    id = Column(Integer, primary_key=True)
    config_id = Column(Integer, ForeignKey("integration_configs.id"))
    integration_type = Column(Enum(IntegrationType), nullable=False)
    direction = Column(String(10))  # in / out
    status = Column(String(50))     # success / error
    payload = Column(Text)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class YclientsSyncCache(Base):
    """Cached metrics from Yclients — refreshed periodically."""
    __tablename__ = "yclients_sync_cache"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    revenue = Column(Integer)            # kopecks
    clients_count = Column(Integer)
    repeat_clients_count = Column(Integer)
    schedule_fill_pct = Column(Integer)  # 0–100
    regular_clients_count = Column(Integer)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())


class AIConversation(Base):
    """Chat history between a user and the AI assistant."""
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False)   # user / assistant
    content = Column(Text, nullable=False)
    model_used = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AIReport(Base):
    """Generated AI digests and summaries."""
    __tablename__ = "ai_reports"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    branch_id = Column(Integer, ForeignKey("branches.id"))
    requested_by = Column(Integer, ForeignKey("users.id"))
    report_type = Column(String(100))    # weekly_digest / on_demand / psych_interpretation
    content = Column(Text, nullable=False)
    model_used = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AIDigestSettings(Base):
    """Schedule for automatic AI digests."""
    __tablename__ = "ai_digest_settings"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    recipient_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # cron-style: "MON 09:00"
    schedule = Column(String(50), default="MON 09:00")
    is_enabled = Column(Boolean, default=True)
    last_sent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
