"""
Subscription & payment endpoints.

GET  /api/subscriptions/plans           — list available plans
GET  /api/subscriptions/current         — current subscription for org
POST /api/subscriptions/create-payment  — create YooKassa payment → confirmation_url
POST /api/subscriptions/webhook         — YooKassa webhook (succeeded/canceled)
GET  /api/subscriptions/invoices        — payment history
POST /api/subscriptions/promo           — apply promo code (validate + mark used)
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from deps import get_current_user, require_roles
from models.payments import Payment, PaymentStatus
from models.users import (
    PromoCode,
    Subscription,
    SubscriptionStatus,
    User,
    UserStatus,
)
from services import yookassa_service

logger = logging.getLogger(__name__)
router = APIRouter()

MANAGE_ROLES = ("superadmin", "owner", "admin")

# ── Plan definitions ──────────────────────────────────────────────────────────

PLAN_BASE_USERS = 10

PLANS = [
    {
        "id":          "starter",
        "name":        "Стартер",
        "description": "До 10 сотрудников",
        "base_price":  290000,   # kopecks = 2 900 ₽/мес
        "per_user":    0,
        "max_users":   10,
        "period_days": 30,
    },
    {
        "id":          "growth",
        "name":        "Рост",
        "description": "До 30 сотрудников (фикс + доплата за каждого свыше 10)",
        "base_price":  490000,   # 4 900 ₽/мес за первых 10
        "per_user":    29000,    # + 290 ₽ за каждого свыше 10
        "max_users":   30,
        "period_days": 30,
    },
    {
        "id":          "pro",
        "name":        "Про",
        "description": "Неограниченное количество сотрудников",
        "base_price":  990000,   # 9 900 ₽/мес
        "per_user":    19000,    # + 190 ₽ за каждого свыше 10
        "max_users":   None,
        "period_days": 30,
    },
]


def _calc_price(plan: dict, user_count: int) -> int:
    extra = max(0, user_count - PLAN_BASE_USERS)
    return plan["base_price"] + extra * plan["per_user"]


def _plan_by_id(plan_id: str) -> dict | None:
    return next((p for p in PLANS if p["id"] == plan_id), None)


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_active_sub(db: AsyncSession, org_id: int) -> Subscription | None:
    row = await db.execute(
        select(Subscription)
        .where(Subscription.org_id == org_id, Subscription.is_active == True)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    return row.scalar()


async def _active_user_count(db: AsyncSession, org_id: int) -> int:
    r = await db.execute(
        select(func.count(User.id)).where(
            User.org_id == org_id,
            User.status.in_([UserStatus.active, UserStatus.trial]),
        )
    )
    return r.scalar() or 0


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreatePaymentIn(BaseModel):
    plan_id:    str
    return_url: str
    promo_code: str | None = None


class PromoIn(BaseModel):
    code: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans(_: User = Depends(get_current_user)):
    return PLANS


@router.get("/current")
async def current_subscription(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    if not actor.org_id:
        return {
            "status":     SubscriptionStatus.trial,
            "plan_name":  "Триал",
            "ends_at":    None,
            "user_count": 0,
            "days_left":  None,
            "is_frozen":  False,
        }

    sub = await _get_active_sub(db, actor.org_id)
    user_count = await _active_user_count(db, actor.org_id)
    now = datetime.now(timezone.utc)

    if sub is None:
        return {
            "status":     SubscriptionStatus.trial,
            "plan_name":  "Триал",
            "ends_at":    None,
            "user_count": user_count,
            "days_left":  None,
            "is_frozen":  False,
        }

    ends_at = sub.ends_at
    if ends_at and ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)

    days_left = (ends_at - now).days if ends_at else None
    status = sub.status or SubscriptionStatus.trial

    # Auto-freeze if expired
    if ends_at and ends_at < now and status != SubscriptionStatus.frozen:
        sub.status = SubscriptionStatus.frozen
        status = SubscriptionStatus.frozen
        await db.commit()

    return {
        "status":     status,
        "plan_name":  sub.plan_name or "—",
        "ends_at":    ends_at.isoformat() if ends_at else None,
        "user_count": user_count,
        "days_left":  days_left,
        "is_frozen":  status == SubscriptionStatus.frozen,
    }


@router.post("/create-payment")
async def create_payment(
    body: CreatePaymentIn,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    if not actor.org_id:
        raise HTTPException(status_code=400, detail="Организация не найдена")

    plan = _plan_by_id(body.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Тариф '{body.plan_id}' не найден")

    user_count = await _active_user_count(db, actor.org_id)
    amount = _calc_price(plan, user_count)

    discount = 0
    if body.promo_code:
        promo = await _validate_promo(db, body.promo_code, actor.org_id)
        discount = promo.discount_percent or 0
        amount = int(amount * (1 - discount / 100))

    description = f"Подписка «{plan['name']}» на {plan['period_days']} дней"

    try:
        result = await yookassa_service.create_payment(
            amount_kopecks=amount,
            description=description,
            org_id=actor.org_id,
            return_url=body.return_url,
            plan_name=plan["id"],
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    db.add(Payment(
        org_id=actor.org_id,
        yookassa_id=result["yookassa_id"],
        amount_kopecks=amount,
        description=description,
        status=PaymentStatus.pending,
        plan_name=plan["id"],
        confirmation_url=result["confirmation_url"],
    ))
    await db.commit()

    return {
        "confirmation_url": result["confirmation_url"],
        "yookassa_id":      result["yookassa_id"],
        "amount_kopecks":   amount,
        "discount_percent": discount,
    }


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    YooKassa sends webhooks from allowlisted IPs.
    IP verification is handled at infrastructure level (nginx/firewall).
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    obj   = payload.get("object", {})
    yookassa_id = obj.get("id")

    if not yookassa_id:
        return {"ok": True}

    payment_row = (await db.execute(
        select(Payment).where(Payment.yookassa_id == yookassa_id)
    )).scalar()

    if not payment_row:
        logger.warning("Webhook for unknown payment: %s", yookassa_id)
        return {"ok": True}

    if event == "payment.succeeded":
        payment_row.status = PaymentStatus.succeeded
        payment_row.paid_at = datetime.now(timezone.utc)

        plan = _plan_by_id(payment_row.plan_name or "starter")
        period = plan["period_days"] if plan else 30
        now = datetime.now(timezone.utc)

        existing = await _get_active_sub(db, payment_row.org_id)
        if existing:
            base = existing.ends_at or now
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            existing.ends_at  = max(base, now) + timedelta(days=period)
            existing.status   = SubscriptionStatus.active
            existing.plan_name = payment_row.plan_name
            existing.is_active = True
        else:
            db.add(Subscription(
                org_id=payment_row.org_id,
                plan_name=payment_row.plan_name,
                price=payment_row.amount_kopecks,
                starts_at=now,
                ends_at=now + timedelta(days=period),
                is_active=True,
                status=SubscriptionStatus.active,
            ))

        logger.info("Subscription activated for org %s (payment %s)",
                    payment_row.org_id, yookassa_id)

    elif event == "payment.canceled":
        payment_row.status = PaymentStatus.canceled
        logger.info("Payment canceled: %s", yookassa_id)

    await db.commit()
    return {"ok": True}


@router.get("/invoices")
async def invoices(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    if not actor.org_id:
        return []

    rows = await db.execute(
        select(Payment)
        .where(Payment.org_id == actor.org_id)
        .order_by(Payment.created_at.desc())
        .limit(50)
    )
    return [
        {
            "id":             p.id,
            "yookassa_id":    p.yookassa_id,
            "amount_kopecks": p.amount_kopecks,
            "amount_rub":     round(p.amount_kopecks / 100, 2),
            "status":         p.status,
            "plan_name":      p.plan_name,
            "paid_at":        p.paid_at.isoformat() if p.paid_at else None,
            "created_at":     p.created_at.isoformat(),
        }
        for p in rows.scalars().all()
    ]


async def _validate_promo(db: AsyncSession, code: str, org_id: int) -> PromoCode:
    promo = (await db.execute(
        select(PromoCode).where(PromoCode.code == code)
    )).scalar()

    if not promo:
        raise HTTPException(status_code=400, detail="Промокод не найден")
    if promo.is_used:
        raise HTTPException(status_code=400, detail="Промокод уже использован")

    now = datetime.now(timezone.utc)
    if promo.expires_at:
        exp = promo.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now:
            raise HTTPException(status_code=400, detail="Срок действия промокода истёк")

    return promo


@router.post("/promo")
async def apply_promo(
    body: PromoIn,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    if not actor.org_id:
        raise HTTPException(status_code=400, detail="Организация не найдена")

    promo = await _validate_promo(db, body.code, actor.org_id)
    promo.is_used = True
    promo.used_by = actor.id
    promo.used_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "ok":               True,
        "discount_percent": promo.discount_percent or 0,
        "message":          f"Промокод применён: скидка {promo.discount_percent or 0}%",
    }
