"""
Academy (новички) database models.

Tables: academy_schedule, academy_enrollments, academy_attendance,
        academy_absence_notices, academy_materials, academy_material_confirms,
        academy_novice_journal, academy_feedback, academy_attestations,
        skip_counters
"""
import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class NoviceStatus(str, enum.Enum):
    in_training = "in_training"
    base_certified = "base_certified"
    full_certified = "full_certified"
    blocked = "blocked"
    failed = "failed"


class AttestationResult(str, enum.Enum):
    pending = "pending"
    passed = "passed"
    failed = "failed"


class AcademySchedule(Base):
    __tablename__ = "academy_schedule"

    id = Column(Integer, primary_key=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    topic = Column(String(255), nullable=False)
    description = Column(Text)
    starts_at = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, default=60)
    min_students = Column(Integer, default=1)
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    enrollments = relationship("AcademyEnrollment", back_populates="schedule")
    materials = relationship("AcademyMaterial", back_populates="schedule")
    attendance = relationship("AcademyAttendance", back_populates="schedule")


class AcademyEnrollment(Base):
    __tablename__ = "academy_enrollments"

    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("academy_schedule.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_mandatory = Column(Boolean, default=True)  # False for veteran masters
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    schedule = relationship("AcademySchedule", back_populates="enrollments")


class AcademyAttendance(Base):
    __tablename__ = "academy_attendance"

    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("academy_schedule.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    was_present = Column(Boolean)
    score = Column(Float)  # 1–10
    criteria_scores = Column(Text)  # JSON: {criterion: score}
    comment = Column(Text)
    recorded_by = Column(Integer, ForeignKey("users.id"))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    schedule = relationship("AcademySchedule", back_populates="attendance")


class AcademyAbsenceNotice(Base):
    __tablename__ = "academy_absence_notices"

    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("academy_schedule.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(Text)
    # hours_before_class > 24 → не считается пропуском
    noticed_at = Column(DateTime(timezone=True), server_default=func.now())
    hours_before_class = Column(Float)
    counts_as_skip = Column(Boolean, default=True)


class AcademyMaterial(Base):
    __tablename__ = "academy_materials"

    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("academy_schedule.id"), nullable=False)
    title = Column(String(255), nullable=False)
    file_url = Column(String(1000))  # Yandex Object Storage key
    material_type = Column(String(50))  # pdf, video, link
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    schedule = relationship("AcademySchedule", back_populates="materials")
    confirms = relationship("AcademyMaterialConfirm", back_populates="material")


class AcademyMaterialConfirm(Base):
    __tablename__ = "academy_material_confirms"

    id = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("academy_materials.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    confirmed_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("AcademyMaterial", back_populates="confirms")


class AcademyNoviceJournal(Base):
    __tablename__ = "academy_novice_journal"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    status = Column(Enum(NoviceStatus), nullable=False, default=NoviceStatus.in_training)
    hired_at = Column(DateTime(timezone=True))
    interview_result = Column(Text)
    psych_test_summary = Column(Text)
    total_training_hours = Column(Float, default=0)
    notes = Column(Text)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AcademyFeedback(Base):
    """Anonymous feedback after a class."""
    __tablename__ = "academy_feedback"

    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("academy_schedule.id"), nullable=False)
    rating = Column(Integer)  # 1–5
    comment = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AcademyAttestation(Base):
    __tablename__ = "academy_attestations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    attempt_number = Column(Integer, nullable=False, default=1)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    scheduled_at = Column(DateTime(timezone=True))
    examiner_id = Column(Integer, ForeignKey("users.id"))
    result = Column(Enum(AttestationResult), default=AttestationResult.pending)
    notes = Column(Text)
    # 4th+ attempt requires explicit approval
    approved_by = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))


class SkipCounter(Base):
    """Cumulative skip counter per user."""
    __tablename__ = "skip_counters"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    count = Column(Integer, default=0)
    last_skip_at = Column(DateTime(timezone=True))
    last_reset_by = Column(Integer, ForeignKey("users.id"))
    last_reset_at = Column(DateTime(timezone=True))
