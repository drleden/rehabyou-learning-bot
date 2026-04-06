"""
Payment database model.

Table: payments
"""
import enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class PaymentStatus(str, enum.Enum):
    pending   = "pending"
    succeeded = "succeeded"
    canceled  = "canceled"
    refunded  = "refunded"


class Payment(Base):
    __tablename__ = "payments"

    id             = Column(Integer, primary_key=True)
    org_id         = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    yookassa_id    = Column(String(100), unique=True, index=True)   # YooKassa payment UUID
    amount_kopecks = Column(Integer, nullable=False)                # 100 = 1 rub
    description    = Column(String(255))
    status         = Column(String(30), nullable=False, default=PaymentStatus.pending)
    plan_name      = Column(String(100))
    confirmation_url = Column(Text)
    paid_at        = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")
