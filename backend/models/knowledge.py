"""Knowledge base document model."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from database import Base

KNOWLEDGE_CATEGORIES = {
    "standards":    "Стандарты",
    "instructions": "Инструкции",
    "useful":       "Полезное",
}


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(50), nullable=False, default="useful")
    content = Column(Text, nullable=False, default="")
    # File attachment (Yandex Object Storage)
    file_url = Column(String(1000))   # S3 object key, e.g. knowledge/<uuid>.pdf
    file_type = Column(String(10))    # pdf / docx / png / jpg
    file_size = Column(Integer)       # bytes
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
