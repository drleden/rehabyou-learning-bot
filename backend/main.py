import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from database import engine
from models import Base  # noqa: F401 — imported so Alembic can see all tables
from bot import build_application
from routers import (
    academy,
    admin,
    ai,
    analytics,
    auth,
    courses,
    integrations,
    learning,
    notifications,
    psych_tests,
    services,
    subscriptions,
    users,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting Rehab.You Learning API (env=%s)", settings.APP_ENV)

    # ── Start Telegram bot (polling) alongside FastAPI ────────────────────────
    tg_app = None
    if settings.TELEGRAM_BOT_TOKEN:
        try:
            tg_app = build_application()
            await tg_app.initialize()
            await tg_app.start()
            await tg_app.updater.start_polling(drop_pending_updates=True)
            logger.info("Telegram bot started (polling)")
        except Exception:
            logger.exception("Failed to start Telegram bot — continuing without it")
            tg_app = None
    else:
        logger.warning("TELEGRAM_BOT_TOKEN not set — bot disabled")

    # ── Start background scheduler ────────────────────────────────────────────
    try:
        from services.scheduler import start_scheduler
        start_scheduler()
    except Exception:
        logger.exception("Failed to start scheduler — continuing without it")

    yield

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    try:
        from services.scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        logger.exception("Error stopping scheduler")

    if tg_app is not None:
        await tg_app.updater.stop()
        await tg_app.stop()
        await tg_app.shutdown()
        logger.info("Telegram bot stopped")
    logger.info("Shutting down API")
    await engine.dispose()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Rehab.You Learning API",
    version="1.0.0",
    description=(
        "Backend для образовательной платформы Rehab.You. "
        "Онлайн-обучение, академия новичков, допуски к услугам, "
        "психологические тесты, ИИ-ассистент."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ── CORS ──────────────────────────────────────────────────────────────────────

try:
    origins = json.loads(settings.BACKEND_CORS_ORIGINS)
except Exception:
    origins = [settings.BACKEND_CORS_ORIGINS]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request logging middleware ────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %d  (%.1f ms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response


# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# ── Routers ───────────────────────────────────────────────────────────────────

API = "/api"

app.include_router(auth.router,         prefix=f"{API}/auth",          tags=["auth"])
app.include_router(users.router,        prefix=f"{API}/users",         tags=["users"])
app.include_router(courses.router,      prefix=f"{API}/courses",       tags=["courses"])
app.include_router(learning.router,     prefix=f"{API}/learning",      tags=["learning"])
app.include_router(academy.router,      prefix=f"{API}/academy",       tags=["academy"])
app.include_router(services.router,     prefix=f"{API}/services",      tags=["services"])
app.include_router(psych_tests.router,  prefix=f"{API}/psych-tests",   tags=["psych_tests"])
app.include_router(ai.router,            prefix=f"{API}/ai",             tags=["ai"])
app.include_router(notifications.router, prefix=f"{API}/notifications",  tags=["notifications"])
app.include_router(subscriptions.router, prefix=f"{API}/subscriptions",  tags=["subscriptions"])
app.include_router(analytics.router,     prefix=f"{API}/analytics",      tags=["analytics"])
app.include_router(integrations.router,  prefix=f"{API}/integrations",   tags=["integrations"])
app.include_router(admin.router,         prefix=f"{API}/admin",          tags=["admin"])


# ── Health check ──────────────────────────────────────────────────────────────

@app.get(
    "/health",
    tags=["system"],
    summary="Health check",
    response_description="Service status and version",
)
async def health():
    """
    Проверка работоспособности сервиса.
    Используется Docker healthcheck и мониторингом.
    """
    return {
        "status": "ok",
        "version": app.version,
        "env": settings.APP_ENV,
    }
