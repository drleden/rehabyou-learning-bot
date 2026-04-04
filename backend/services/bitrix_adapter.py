"""
Bitrix24 integration adapter.

Status: stub — to be implemented after v1 launch.

Responsibilities (v1 read-only):
- Fetch employee data for manual reconciliation
- No auto-sync in v1

v2 additions:
- Push learning status to Bitrix24 HR card
- Push attestation results
"""
from config import settings


class BitrixAdapter:

    def __init__(self):
        self.webhook_url = settings.BITRIX24_WEBHOOK_URL

    async def get_employees(self) -> list[dict]:
        """
        Fetch employee list from Bitrix24.

        Returns list of dicts with at minimum:
            {"ID": str, "NAME": str, "LAST_NAME": str, ...}
        """
        raise NotImplementedError("Bitrix24 integration is reserved for post-v1.")

    async def push_learning_status(self, bitrix_user_id: str, status: str) -> None:
        """Push learning status to Bitrix24 user HR field — v2 only."""
        raise NotImplementedError("Bitrix24 integration is reserved for post-v1.")
