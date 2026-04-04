"""
Yclients integration adapter.

Status: stub — to be implemented after v1 launch.

Responsibilities (v1 read-only):
- Fetch master revenue by period
- Fetch clients count
- Fetch repeat client rate
- Fetch schedule fill percentage
- Cache results in yclients_sync_cache table
"""
from config import settings


class YclientsAdapter:
    BASE_URL = "https://api.yclients.com/api/v1"

    def __init__(self):
        self.token = settings.YCLIENTS_TOKEN
        self.partner_token = settings.YCLIENTS_PARTNER_TOKEN
        self.company_id = settings.YCLIENTS_COMPANY_ID

    async def get_staff_stats(self, yclients_staff_id: str, date_from: str, date_to: str) -> dict:
        """
        Fetch aggregated stats for a single staff member.

        Returns:
            {
                "revenue": int,           # kopecks
                "clients_count": int,
                "repeat_clients_count": int,
                "schedule_fill_pct": int,
                "regular_clients_count": int,
            }
        """
        raise NotImplementedError("Yclients integration is reserved for post-v1.")

    async def sync_all_staff(self, org_id: int) -> None:
        """Sync all staff stats and upsert into yclients_sync_cache."""
        raise NotImplementedError("Yclients integration is reserved for post-v1.")
