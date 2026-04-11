"""
Knowledge base endpoints.

GET    /api/knowledge/      — list documents (authenticated)
POST   /api/knowledge/      — create document with file (superadmin/owner/manager/admin)
GET    /api/knowledge/{id}  — get document + presigned view URL (authenticated)
PUT    /api/knowledge/{id}  — update document, optionally replace file
DELETE /api/knowledge/{id}  — delete document (superadmin/owner/manager/admin)
"""
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

import aioboto3
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from deps import get_current_user, require_roles
from models.knowledge import KNOWLEDGE_CATEGORIES, KnowledgeDocument
from models.users import User

logger = logging.getLogger(__name__)
router = APIRouter()

MANAGE = ("superadmin", "owner", "manager", "admin")

ALLOWED_MIME: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
}
EXT_MAP: dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".png": "png",
    ".jpg": "jpg",
    ".jpeg": "jpg",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
PRESIGN_TTL = 86_400              # 24 hours


# ── S3 helpers ────────────────────────────────────────────────────────────────

def _s3_client():
    return aioboto3.Session().client(
        "s3",
        endpoint_url=settings.YANDEX_ENDPOINT_URL,
        aws_access_key_id=settings.YANDEX_ACCESS_KEY_ID,
        aws_secret_access_key=settings.YANDEX_SECRET_ACCESS_KEY,
        region_name="ru-central1",
    )


async def _upload_bytes(data: bytes, key: str, content_type: str) -> None:
    async with _s3_client() as s3:
        await s3.put_object(
            Bucket=settings.YANDEX_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType=content_type,
        )


async def _presign(key: str) -> str:
    async with _s3_client() as s3:
        return await s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.YANDEX_BUCKET_NAME, "Key": key},
            ExpiresIn=PRESIGN_TTL,
        )


def _detect_type(filename: str, content_type: str) -> Optional[str]:
    """Return normalised file type (pdf/docx/png/jpg) or None if not allowed."""
    if content_type in ALLOWED_MIME:
        return ALLOWED_MIME[content_type]
    ext = os.path.splitext(filename or "")[1].lower()
    return EXT_MAP.get(ext)


# ── Schemas ───────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: str
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentDetail(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: str
    content: str = ""
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    view_url: Optional[str] = None   # presigned URL, generated on request
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None


def _to_detail(doc: KnowledgeDocument, view_url: Optional[str] = None) -> DocumentDetail:
    return DocumentDetail(
        id=doc.id,
        title=doc.title,
        description=doc.description,
        category=doc.category,
        content=doc.content or "",
        file_url=doc.file_url,
        file_type=doc.file_type,
        file_size=doc.file_size,
        view_url=view_url,
        created_by=doc.created_by,
        created_at=doc.created_at,
    )


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
    summary="Добавить документ с файлом",
)
async def create_document(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    category: str = Form("useful"),
    file: UploadFile = File(...),
    caller: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    if category not in KNOWLEDGE_CATEGORIES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Категория должна быть одной из: {', '.join(KNOWLEDGE_CATEGORIES)}",
        )

    file_type = _detect_type(file.filename or "", file.content_type or "")
    if not file_type:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Допустимые форматы: PDF, DOCX, PNG, JPG",
        )

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Файл слишком большой (максимум 20 МБ)",
        )

    key = f"knowledge/{uuid.uuid4()}.{file_type}"
    await _upload_bytes(data, key, file.content_type or "application/octet-stream")

    doc = KnowledgeDocument(
        title=title,
        description=description or None,
        category=category,
        content="",
        file_url=key,
        file_type=file_type,
        file_size=len(data),
        created_by=caller.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info("Knowledge document created: id=%s title=%r file=%s", doc.id, doc.title, key)

    view_url = await _presign(key)
    return _to_detail(doc, view_url)


@router.get("/{doc_id}", response_model=DocumentDetail, summary="Получить документ + presigned URL")
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

    view_url = None
    if doc.file_url:
        view_url = await _presign(doc.file_url)

    return _to_detail(doc, view_url)


@router.put("/{doc_id}", response_model=DocumentDetail, summary="Обновить документ")
async def update_document(
    doc_id: int,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Документ не найден")

    if title is not None:
        doc.title = title
    if description is not None:
        doc.description = description or None
    if category is not None:
        if category not in KNOWLEDGE_CATEGORIES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Категория должна быть одной из: {', '.join(KNOWLEDGE_CATEGORIES)}",
            )
        doc.category = category

    # Replace file if a new one is provided
    if file is not None and file.filename:
        file_type = _detect_type(file.filename, file.content_type or "")
        if not file_type:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Допустимые форматы: PDF, DOCX, PNG, JPG",
            )
        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Файл слишком большой (максимум 20 МБ)",
            )
        key = f"knowledge/{uuid.uuid4()}.{file_type}"
        await _upload_bytes(data, key, file.content_type or "application/octet-stream")
        doc.file_url = key
        doc.file_type = file_type
        doc.file_size = len(data)

    await db.commit()
    await db.refresh(doc)
    logger.info("Knowledge document updated: id=%s", doc_id)

    view_url = None
    if doc.file_url:
        view_url = await _presign(doc.file_url)

    return _to_detail(doc, view_url)


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
