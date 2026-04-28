from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.knowledge import KnowledgeArticle, KnowledgeCategory
from app.models.user import User, UserRole

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# --- Schemas ---

class CategoryOut(BaseModel):
    id: int
    title: str
    slug: str
    icon: str
    description: str | None = None
    parent_slug: str | None = None
    order_index: int
    visible_roles: list | None = None
    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    title: str
    slug: str
    icon: str = "📄"
    description: str | None = None
    parent_slug: str | None = None
    order_index: int = 0
    visible_roles: list | None = None


class ArticleOut(BaseModel):
    id: int
    category_id: int
    title: str
    content: str
    video_url: str | None = None
    cover_url: str | None = None
    tags: list | None = None
    visible_roles: list | None = None
    is_published: bool
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
    order_index: int
    model_config = {"from_attributes": True}


class ArticleCreate(BaseModel):
    category_id: int
    title: str
    content: str = ""
    video_url: str | None = None
    cover_url: str | None = None
    tags: list | None = None
    visible_roles: list | None = None
    is_published: bool = False
    order_index: int = 0


class ArticleUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category_id: int | None = None
    video_url: str | None = None
    cover_url: str | None = None
    tags: list | None = None
    visible_roles: list | None = None
    is_published: bool | None = None
    order_index: int | None = None


def _role_visible(visible_roles, user_role: str) -> bool:
    if not visible_roles:
        return True
    return user_role in visible_roles


# --- Categories ---

@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeCategory).order_by(KnowledgeCategory.order_index))
    cats = result.scalars().all()
    return [
        CategoryOut.model_validate(c) for c in cats
        if _role_visible(c.visible_roles, current_user.role.value)
    ]


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    cat = KnowledgeCategory(**body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.get("/categories/{slug}/articles", response_model=list[ArticleOut])
async def list_articles_by_category(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cat_res = await db.execute(select(KnowledgeCategory).where(KnowledgeCategory.slug == slug))
    cat = cat_res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    is_admin = current_user.role.value in ("manager", "owner", "superadmin")
    query = select(KnowledgeArticle).where(KnowledgeArticle.category_id == cat.id)
    if not is_admin:
        query = query.where(KnowledgeArticle.is_published.is_(True))
    query = query.order_by(KnowledgeArticle.order_index, KnowledgeArticle.id)
    result = await db.execute(query)
    articles = result.scalars().all()
    return [
        ArticleOut.model_validate(a) for a in articles
        if _role_visible(a.visible_roles, current_user.role.value)
    ]


# --- Articles ---

@router.get("/articles/{article_id}", response_model=ArticleOut)
async def get_article(
    article_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == article_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    return ArticleOut.model_validate(a)


@router.get("/search", response_model=list[ArticleOut])
async def search_articles(
    q: str = Query(..., min_length=2),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pattern = f"%{q}%"
    query = (
        select(KnowledgeArticle)
        .where(
            KnowledgeArticle.is_published.is_(True),
            or_(
                KnowledgeArticle.title.ilike(pattern),
                KnowledgeArticle.content.ilike(pattern),
            ),
        )
        .order_by(KnowledgeArticle.id.desc())
        .limit(20)
    )
    result = await db.execute(query)
    articles = result.scalars().all()
    return [
        ArticleOut.model_validate(a) for a in articles
        if _role_visible(a.visible_roles, current_user.role.value)
    ]


@router.get("/articles/", response_model=list[ArticleOut])
async def list_all_articles(
    category_id: int | None = None,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    query = select(KnowledgeArticle).order_by(KnowledgeArticle.id.desc())
    if category_id is not None:
        query = query.where(KnowledgeArticle.category_id == category_id)
    result = await db.execute(query)
    return [ArticleOut.model_validate(a) for a in result.scalars().all()]


class ArticleImportItem(BaseModel):
    category_slug: str
    title: str
    content: str = ""
    tags: list | None = None
    video_url: str | None = None
    is_published: bool = True


class ArticleImportRequest(BaseModel):
    articles: list[ArticleImportItem]


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_articles(
    body: ArticleImportRequest,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    slug_cache = {}
    created = 0
    for item in body.articles:
        if item.category_slug not in slug_cache:
            res = await db.execute(
                select(KnowledgeCategory).where(KnowledgeCategory.slug == item.category_slug)
            )
            cat = res.scalar_one_or_none()
            if not cat:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Category slug '{item.category_slug}' not found",
                )
            slug_cache[item.category_slug] = cat.id

        article = KnowledgeArticle(
            category_id=slug_cache[item.category_slug],
            title=item.title,
            content=item.content,
            tags=item.tags,
            video_url=item.video_url,
            is_published=item.is_published,
            created_by=current_user.id,
        )
        db.add(article)
        created += 1

    await db.commit()
    return {"created": created}


@router.post("/articles", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
async def create_article(
    body: ArticleCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    article = KnowledgeArticle(**body.model_dump(), created_by=current_user.id)
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return ArticleOut.model_validate(article)


@router.patch("/articles/{article_id}", response_model=ArticleOut)
async def update_article(
    article_id: int,
    body: ArticleUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(article, field, value)
    await db.commit()
    await db.refresh(article)
    return ArticleOut.model_validate(article)


@router.delete("/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_article(
    article_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    await db.delete(article)
    await db.commit()
