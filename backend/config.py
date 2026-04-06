from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://rehabyou:changeme@db:5432/rehabyou"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    SUPERADMIN_TELEGRAM_IDS: str = ""

    # Claude API
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # Yandex Object Storage
    YANDEX_ACCESS_KEY_ID: str = ""
    YANDEX_SECRET_ACCESS_KEY: str = ""
    YANDEX_BUCKET_NAME: str = ""
    YANDEX_ENDPOINT_URL: str = "https://storage.yandexcloud.net"
    PRESIGNED_URL_TTL: int = 7200

    # YooKassa
    YOOKASSA_SHOP_ID: str = ""
    YOOKASSA_SECRET_KEY: str = ""

    # Yclients
    YCLIENTS_TOKEN: str = ""
    YCLIENTS_PARTNER_TOKEN: str = ""
    YCLIENTS_COMPANY_ID: str = ""

    # Bitrix24
    BITRIX24_WEBHOOK_URL: str = ""

    # App
    SECRET_KEY: str = "change-me-in-production"
    APP_ENV: str = "development"
    APP_DOMAIN: str = "learn.rehabyou.site"
    # JSON array string or single origin
    BACKEND_CORS_ORIGINS: str = '["http://localhost:3000"]'

    @property
    def superadmin_ids(self) -> list[int]:
        return [int(x) for x in self.SUPERADMIN_TELEGRAM_IDS.split(",") if x.strip()]


settings = Settings()
