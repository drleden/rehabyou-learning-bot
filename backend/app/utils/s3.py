import uuid

import boto3
from botocore.config import Config

from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def generate_presigned_upload_url(key: str, content_type: str, expires: int = 3600) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )


def generate_presigned_download_url(key: str, expires: int = 86400) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def delete_file(key: str):
    client = get_s3_client()
    client.delete_object(Bucket=settings.S3_BUCKET, Key=key)


def make_file_key(folder: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    unique = uuid.uuid4().hex[:12]
    return f"{folder}/{unique}.{ext}" if ext else f"{folder}/{unique}"


def get_public_url(key: str) -> str:
    return f"{settings.S3_ENDPOINT}/{settings.S3_BUCKET}/{key}"
