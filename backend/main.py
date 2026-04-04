from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    auth,
    users,
    courses,
    academy,
    services,
    psych_tests,
    ai,
    subscriptions,
    analytics,
    integrations,
    admin,
)

app = FastAPI(
    title="Rehab.You Learning API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # overridden via env BACKEND_CORS_ORIGINS in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
app.include_router(academy.router, prefix="/api/academy", tags=["academy"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(psych_tests.router, prefix="/api/psych-tests", tags=["psych_tests"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["integrations"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
