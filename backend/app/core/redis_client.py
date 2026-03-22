import logging

import redis
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def try_get_redis() -> redis.Redis | None:
    """Fail-open Redis for optional caching (embeddings, LLM cache handles errors internally)."""
    try:
        r = get_redis()
        r.ping()
        return r
    except redis.RedisError:
        logger.debug("Redis ping failed; proceeding without optional cache")
        return None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.redis_url, decode_responses=True)
    return _client


def _redis_unavailable(exc: redis.RedisError) -> HTTPException:
    logger.warning("Redis operation failed: %s", exc)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Session service temporarily unavailable. Please try again.",
    )


def blacklist_refresh_jti(jti: str, ttl_seconds: int) -> None:
    try:
        get_redis().setex(f"refresh_bl:{jti}", ttl_seconds, "1")
    except redis.RedisError as e:
        raise _redis_unavailable(e) from e


def is_refresh_blacklisted(jti: str) -> bool:
    try:
        return bool(get_redis().exists(f"refresh_bl:{jti}"))
    except redis.RedisError as e:
        raise _redis_unavailable(e) from e
