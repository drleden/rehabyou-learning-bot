"""
Knowledge base endpoints.

GET    /api/knowledge/      — list documents (authenticated)
POST   /api/knowledge/      — create document (superadmin/manager/admin)
GET    /api/knowledge/{id}  — get document with content (authenticated)
DELETE /api/knowledge/{id}  — delete document (superadmin/manager/admin)
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user, require_roles
from models.knowledge import KNOWLEDGE_CATEGORIES, KnowledgeDocument
from models.users import User

logger = logging.getLogger(__name__)
router = APIRouter()

MANAGE = ("superadmin", "owner", "manager", "admin")


# ── Schemas ───────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    category: str
    created_by: Optional[int]
    created_at: Optional[datetime]
    class Config: from_attributes = True


class DocumentDetail(DocumentOut):
    content: str


class CreateDocumentIn(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "useful"
    content: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[DocumentOut], summary="Список документов")
async def list_documents(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeDocument)
        .order_by(KnowledgeDocument.category, KnowledgeDocument.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/",
    response_model=DocumentDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить документ",
)
async def create_document(
    body: CreateDocumentIn,
    caller: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    if body.category not in KNOWLEDGE_CATEGORIES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Категория должна быть одной из: {', '.join(KNOWLEDGE_CATEGORIES)}",
        )
    doc = KnowledgeDocument(
        title=body.title,
        description=body.description,
        category=body.category,
        content=body.content,
        created_by=caller.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info("Knowledge document created: id=%s title=%r", doc.id, doc.title)
    return doc


@router.get("/{doc_id}", response_model=DocumentDetail, summary="Получить документ")
async def get_document(
    doc_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Документ не найден")
    return doc


class UpdateDocumentIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None


@router.put("/{doc_id}", response_model=DocumentDetail, summary="Обновить документ")
async def update_document(
    doc_id: int,
    body: UpdateDocumentIn,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Документ не найден")
    if body.title is not None:
        doc.title = body.title
    if body.description is not None:
        doc.description = body.description
    if body.category is not None:
        if body.category not in KNOWLEDGE_CATEGORIES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Категория должна быть одной из: {', '.join(KNOWLEDGE_CATEGORIES)}",
            )
        doc.category = body.category
    if body.content is not None:
        doc.content = body.content
    await db.commit()
    await db.refresh(doc)
    logger.info("Knowledge document updated: id=%s", doc_id)
    return doc


@router.delete(
    "/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить документ",
)
async def delete_document(
    doc_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Документ не найден")
    await db.delete(doc)
    await db.commit()
    logger.info("Knowledge document deleted: id=%s", doc_id)
