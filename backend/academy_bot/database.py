import os
from datetime import datetime, timedelta, timezone

import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "").replace("+asyncpg", "")


async def get_pool():
    return await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)


async def get_user_by_id(pool, user_id: int):
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT id, first_name, last_name, telegram_id, telegram_username, phone "
            "FROM users WHERE id = $1",
            user_id,
        )


async def update_user_telegram(pool, user_id: int, telegram_id: int, telegram_username: str | None):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET telegram_id = $1, telegram_username = $2 WHERE id = $3",
            telegram_id, telegram_username, user_id,
        )


async def get_inactive_users(pool, days: int = 3):
    """Users with telegram_id, not seen for N+ days, with in-progress courses."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT DISTINCT u.id, u.first_name, u.telegram_id
            FROM users u
            WHERE u.telegram_id IS NOT NULL
              AND u.is_active = true
              AND u.is_blocked = false
              AND (u.last_seen_at < $1 OR u.last_seen_at IS NULL)
              AND EXISTS (
                  SELECT 1 FROM lesson_progress lp
                  WHERE lp.user_id = u.id
                    AND lp.status = 'in_progress'
              )
            """,
            cutoff,
        )
