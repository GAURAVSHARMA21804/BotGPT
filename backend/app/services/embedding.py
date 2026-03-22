import hashlib
import json

import httpx

from app.core.config import settings


def cache_key_for_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def embed_texts_sync(texts: list[str]) -> list[list[float]]:
    """Synchronous embeddings (for background ingest)."""
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set; required for embeddings / RAG.")

    body = {"model": settings.openai_embedding_model, "input": texts}
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=120) as client:
        r = client.post("https://api.openai.com/v1/embeddings", json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    items = sorted(data["data"], key=lambda x: x["index"])
    return [item["embedding"] for item in items]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Async embeddings for query path."""
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set; required for embeddings / RAG.")

    body = {"model": settings.openai_embedding_model, "input": texts}
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post("https://api.openai.com/v1/embeddings", json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    items = sorted(data["data"], key=lambda x: x["index"])
    return [item["embedding"] for item in items]


async def embed_query_cached(redis, text: str) -> list[float]:
    import redis as redis_lib

    if redis is None:
        vecs = await embed_texts([text])
        return vecs[0]
    key = f"emb:{cache_key_for_text(text)}"
    try:
        cached = redis.get(key)
        if cached:
            return json.loads(cached)
    except redis_lib.RedisError:
        pass
    vecs = await embed_texts([text])
    try:
        redis.setex(key, 86400, json.dumps(vecs[0]))
    except redis_lib.RedisError:
        pass
    return vecs[0]
