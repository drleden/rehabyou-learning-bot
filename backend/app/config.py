from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://rehabyou:rehabyou@localhost:5432/rehabyou"
    SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 30
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://app.rehabyou.site",
    ]

    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "rehabyou-storage"
    S3_ENDPOINT: str = "https://storage.yandexcloud.net"
    S3_REGION: str = "ru-central1"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
