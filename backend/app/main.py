from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, users, studios, courses, lessons, tests, assignments, permissions, export

app = FastAPI(title="Rehab.You Learning API", version="1.0.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"

app.include_router(auth.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(studios.router, prefix=PREFIX)
app.include_router(courses.router, prefix=PREFIX)
app.include_router(lessons.router, prefix=PREFIX)
app.include_router(tests.router, prefix=PREFIX)
app.include_router(assignments.router, prefix=PREFIX)
app.include_router(permissions.router, prefix=PREFIX)
app.include_router(export.router, prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok"}
