from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.document import Document
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    url: str
    category: str
    visible_roles: list | None = None
    order_index: int
    model_config = {"from_attributes": True}


@router.get("/", response_model=list[DocumentOut])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).order_by(Document.category, Document.order_index))
    docs = result.scalars().all()
    role = current_user.role.value
    return [
        DocumentOut.model_validate(d) for d in docs
        if not d.visible_roles or role in d.visible_roles
    ]


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentOut.model_validate(doc)
