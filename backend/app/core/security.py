from uuid import UUID

from fastapi import Depends, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.responses import raise_http_error
from app.core.jwt_tokens import decode_access_token
from app.database import get_db
from app.models.db_models import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.cookie_access_name)
    if not token:
        auth = request.headers.get("Authorization")
        if auth and auth.startswith("Bearer "):
            token = auth[7:].strip()
    if not token:
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        uid = decode_access_token(token)
    except ValueError:
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "Invalid or expired access token")
    user = db.get(User, uid)
    if not user or not user.is_active:
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def get_current_user_id(user: User = Depends(get_current_user)) -> UUID:
    return user.id
