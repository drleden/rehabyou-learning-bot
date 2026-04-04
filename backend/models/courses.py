"""
Online-learning database models.

Tables: courses, course_roles, modules, lessons, lesson_versions,
        tests, test_questions, user_progress, test_attempts,
        assignments, assignment_answers, questions, question_replies
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
    ARRAY,
    Float,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class LessonStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class AssignmentStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    roles = relationship("CourseRole", back_populates="course")
    modules = relationship("Module", back_populates="course", order_by="Module.position")


class CourseRole(Base):
    """Maps which roles have access to which courses."""
    __tablename__ = "course_roles"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    role = Column(String(50), nullable=False)

    course = relationship("Course", back_populates="roles")


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    course = relationship("Course", back_populates="modules")
    lessons = relationship("Lesson", back_populates="module", order_by="Lesson.position")


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text)
    video_url = Column(String(1000))  # Yandex Object Storage key (presigned on request)
    position = Column(Integer, nullable=False, default=0)
    status = Column(Enum(LessonStatus), nullable=False, default=LessonStatus.draft)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    module = relationship("Module", back_populates="lessons")
    versions = relationship("LessonVersion", back_populates="lesson")
    test = relationship("Test", back_populates="lesson", uselist=False)
    assignment = relationship("Assignment", back_populates="lesson", uselist=False)


class LessonVersion(Base):
    __tablename__ = "lesson_versions"

    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    content = Column(Text)
    video_url = Column(String(1000))
    changed_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lesson = relationship("Lesson", back_populates="versions")


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    pass_threshold = Column(Float, default=0.95)  # 95%
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lesson = relationship("Lesson", back_populates="test")
    questions = relationship("TestQuestion", back_populates="test")


class TestQuestion(Base):
    __tablename__ = "test_questions"

    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(ARRAY(String), nullable=False)
    correct_index = Column(Integer, nullable=False)
    position = Column(Integer, default=0)

    test = relationship("Test", back_populates="questions")


class UserProgress(Base):
    """Never deleted — archived if lesson removed."""
    __tablename__ = "user_progress"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True))
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TestAttempt(Base):
    __tablename__ = "test_attempts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    score = Column(Float)
    passed = Column(Boolean)
    answers = Column(ARRAY(Integer))
    attempt_number = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    description = Column(Text, nullable=False)
    min_words = Column(Integer, default=50)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lesson = relationship("Lesson", back_populates="assignment")
    answers = relationship("AssignmentAnswer", back_populates="assignment")


class AssignmentAnswer(Base):
    __tablename__ = "assignment_answers"

    id = Column(Integer, primary_key=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    status = Column(Enum(AssignmentStatus), nullable=False, default=AssignmentStatus.pending)
    ai_score = Column(Float)
    ai_comment = Column(Text)
    attempt_number = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    assignment = relationship("Assignment", back_populates="answers")


class Question(Base):
    """User questions on lessons — answers managed in v2 UI."""
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    text = Column(Text, nullable=False)
    is_answered = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    replies = relationship("QuestionReply", back_populates="question")


class QuestionReply(Base):
    __tablename__ = "question_replies"

    id = Column(Integer, primary_key=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    question = relationship("Question", back_populates="replies")
