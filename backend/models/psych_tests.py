"""
Psychological tests database models.

Tables: psych_tests, psych_test_questions, psych_test_results
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class PsychTest(Base):
    __tablename__ = "psych_tests"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)       # Белбин, MBTI, выгорание, …
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    questions = relationship("PsychTestQuestion", back_populates="test")
    results = relationship("PsychTestResult", back_populates="test")


class PsychTestQuestion(Base):
    __tablename__ = "psych_test_questions"

    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("psych_tests.id"), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(ARRAY(String))          # None for free-text
    position = Column(Integer, default=0)

    test = relationship("PsychTest", back_populates="questions")


class PsychTestResult(Base):
    __tablename__ = "psych_test_results"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    test_id = Column(Integer, ForeignKey("psych_tests.id"), nullable=False)
    answers = Column(Text)               # JSON array of answers
    raw_score = Column(Text)             # JSON: computed subscale scores
    # AI-generated interpretation tailored to the user's role
    ai_interpretation = Column(Text)
    ai_model_used = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test = relationship("PsychTest", back_populates="results")
