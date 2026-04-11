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
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
