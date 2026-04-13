from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import require_role
from app.models.user import User, UserRole
from app.utils.s3 import generate_presigned_upload_url, get_public_url, make_file_key

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_FOLDERS = {"videos", "images", "documents"}


class PresignedRequest(BaseModel):
    filename: str
    content_type: str
    folder: str = "images"


class PresignedResponse(BaseModel):
    upload_url: str
    file_url: str
    key: str


@router.post("/presigned", response_model=PresignedResponse)
async def get_presigned(
    body: PresignedRequest,
    current_user: User = Depends(require_role(UserRole.manager)),
):
    folder = body.folder if body.folder in ALLOWED_FOLDERS else "documents"
    key = make_file_key(folder, body.filename)
    upload_url = generate_presigned_upload_url(key, body.content_type)
    file_url = get_public_url(key)
    return PresignedResponse(upload_url=upload_url, file_url=file_url, key=key)
