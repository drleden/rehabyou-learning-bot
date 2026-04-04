"""
AI functionality endpoints.

Covers: AI assistant chat, on-demand digest, digest settings.
"""
from fastapi import APIRouter

router = APIRouter()


@router.post("/chat")
async def chat():
    """AI assistant chat for managers/owners. Context: platform data only."""
    raise NotImplementedError


@router.get("/chat/history")
async def chat_history():
    raise NotImplementedError


@router.post("/digest/request")
async def request_digest():
    """On-demand AI digest for superadmin / owner."""
    raise NotImplementedError


@router.get("/digest/settings")
async def get_digest_settings():
    raise NotImplementedError


@router.patch("/digest/settings")
async def update_digest_settings():
    raise NotImplementedError
