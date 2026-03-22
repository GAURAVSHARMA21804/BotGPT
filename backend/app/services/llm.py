import hashlib
import json
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.redis_client import try_get_redis

logger = logging.getLogger(__name__)

GROQ_CHAT_URL = f"{settings.groq_base_url.rstrip('/')}/chat/completions"

SYSTEM_PROMPT = (
    "You are a helpful, accurate assistant. Be concise unless the user asks for detail. "
    "If document excerpts are provided, ground answers in them and say when information is not in the documents."
)


def _prompt_hash(model: str, messages: list[dict[str, str]]) -> str:
    raw = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class LLMService:
    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> tuple[str, dict[str, int]]:
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not set.")

        model = settings.groq_model
        max_t = max_tokens if max_tokens is not None else settings.max_completion_tokens
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_t,
            "temperature": 0.7,
        }
        if stream:
            body["stream"] = True

        redis = try_get_redis()
        cache_key = None
        if not stream and settings.llm_cache_ttl_seconds > 0 and redis is not None:
            cache_key = f"llm:{_prompt_hash(model, messages)}"
            cached = redis.get(cache_key)
            if cached:
                try:
                    data = json.loads(cached)
                    return data["text"], data["usage"]
                except (json.JSONDecodeError, KeyError):
                    pass

        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(GROQ_CHAT_URL, json=body, headers=headers)
            if r.status_code >= 400:
                logger.warning("Groq error %s: %s", r.status_code, r.text[:500])
            r.raise_for_status()
            data = r.json()

        text = data["choices"][0]["message"]["content"]
        u = data.get("usage") or {}
        usage = {
            "prompt_tokens": int(u.get("prompt_tokens", 0)),
            "completion_tokens": int(u.get("completion_tokens", 0)),
            "total_tokens": int(u.get("total_tokens", 0)),
        }

        if cache_key and redis is not None and settings.llm_cache_ttl_seconds > 0:
            redis.setex(
                cache_key,
                settings.llm_cache_ttl_seconds,
                json.dumps({"text": text, "usage": usage}),
            )

        return text, usage

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
    ):
        """Yields SSE lines (without double newline framing — caller wraps)."""
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not set.")

        model = settings.groq_model
        max_t = max_tokens if max_tokens is not None else settings.max_completion_tokens
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_t,
            "temperature": 0.7,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", GROQ_CHAT_URL, json=body, headers=headers) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        payload = line[6:].strip()
                        if payload == "[DONE]":
                            break
                        yield line + "\n"
