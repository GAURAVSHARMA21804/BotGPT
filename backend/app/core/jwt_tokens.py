from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from jose import JWTError, jwt

from app.core.config import settings


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: UUID) -> str:
    expire = _utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "typ": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: UUID) -> tuple[str, str]:
    """Returns (jwt, jti) for blacklist on logout."""
    jti = str(uuid4())
    expire = _utcnow() + timedelta(days=settings.refresh_token_expire_days)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "typ": "refresh",
        "jti": jti,
        "exp": expire,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def decode_access_token(token: str) -> UUID:
    try:
        payload = decode_token(token)
        if payload.get("typ") != "access":
            raise ValueError("not an access token")
        return UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as e:
        raise ValueError("invalid access token") from e


def decode_refresh_token(token: str) -> tuple[UUID, str]:
    try:
        payload = decode_token(token)
        if payload.get("typ") != "refresh":
            raise ValueError("not a refresh token")
        return UUID(payload["sub"]), str(payload["jti"])
    except (JWTError, KeyError, ValueError) as e:
        raise ValueError("invalid refresh token") from e
