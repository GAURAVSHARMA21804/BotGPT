import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.jwt_tokens import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from app.core.password import hash_password, verify_password
from app.core.responses import raise_http_error
from app.core.redis_client import blacklist_refresh_jti, is_refresh_blacklisted
from app.database import get_db
from app.models.db_models import PasswordResetToken, User
from app.core.security import get_current_user
from app.schemas.auth import (
    ForgotPasswordBody,
    LoginBody,
    RegisterBody,
    ResetPasswordBody,
    UserOut,
)
from app.schemas.common import ForgotPasswordSuccessResponse, SuccessResponse

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_TTL_HOURS = 1


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        key=settings.cookie_access_name,
        value=access,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key=settings.cookie_refresh_name,
        value=refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.cookie_access_name, path="/")
    response.delete_cookie(settings.cookie_refresh_name, path="/")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterBody, response: Response, db: Session = Depends(get_db)) -> User:
    existing = db.scalar(select(User).where(User.email == body.email.lower()))
    if existing:
        raise_http_error(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise_http_error(status.HTTP_409_CONFLICT, "Email already registered")
    except SQLAlchemyError:
        db.rollback()
        raise

    access = create_access_token(user.id)
    refresh, _jti = create_refresh_token(user.id)
    _set_auth_cookies(response, access, refresh)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginBody, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.hashed_password):
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise_http_error(status.HTTP_403_FORBIDDEN, "Account disabled")

    access = create_access_token(user.id)
    refresh, _jti = create_refresh_token(user.id)
    _set_auth_cookies(response, access, refresh)
    return user


@router.post("/logout", response_model=SuccessResponse)
def logout(request: Request, response: Response) -> SuccessResponse:
    refresh = request.cookies.get(settings.cookie_refresh_name)
    if refresh:
        try:
            _uid, jti = decode_refresh_token(refresh)
            # Blacklist until natural refresh expiry (approximate TTL)
            blacklist_refresh_jti(jti, settings.refresh_token_expire_days * 86400)
        except ValueError:
            pass
    _clear_auth_cookies(response)
    return SuccessResponse(message="Logged out.")


@router.post("/refresh", response_model=UserOut)
def refresh_tokens(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    raw = request.cookies.get(settings.cookie_refresh_name)
    if not raw:
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "Missing refresh token")
    try:
        user_id, jti = decode_refresh_token(raw)
    except ValueError:
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if is_refresh_blacklisted(jti):
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "Refresh token revoked")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise_http_error(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Rotate refresh: blacklist old jti, issue new pair
    blacklist_refresh_jti(jti, settings.refresh_token_expire_days * 86400)
    access = create_access_token(user.id)
    refresh_new, _new_jti = create_refresh_token(user.id)
    _set_auth_cookies(response, access, refresh_new)
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/forgot-password", response_model=ForgotPasswordSuccessResponse)
def forgot_password(
    body: ForgotPasswordBody, db: Session = Depends(get_db)
) -> ForgotPasswordSuccessResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Always same message (no email enumeration)
    msg = "If an account exists for this email, a reset link will be sent."
    if not user:
        return ForgotPasswordSuccessResponse(message=msg)

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires = _utcnow() + timedelta(hours=RESET_TOKEN_TTL_HOURS)

    try:
        db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        row = PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires)
        db.add(row)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    # In dev, return token so you can test without email
    if settings.app_env == "dev":
        return ForgotPasswordSuccessResponse(
            message=msg,
            reset_token=raw_token,
            expires_in_hours=RESET_TOKEN_TTL_HOURS,
        )
    return ForgotPasswordSuccessResponse(message=msg)


@router.post("/reset-password", response_model=SuccessResponse)
def reset_password(body: ResetPasswordBody, db: Session = Depends(get_db)) -> SuccessResponse:
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    row = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > _utcnow(),
        )
    )
    if not row:
        raise_http_error(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")

    user = db.get(User, row.user_id)
    if not user:
        raise_http_error(status.HTTP_400_BAD_REQUEST, "Invalid token")

    try:
        user.hashed_password = hash_password(body.new_password)
        row.used_at = _utcnow()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    return SuccessResponse(
        message="Password updated. You can sign in with your new password."
    )
