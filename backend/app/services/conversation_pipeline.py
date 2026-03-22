from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db_models import Conversation, ConversationDocument, Document, Message
from app.services.context_builder import build_messages_for_llm
from app.services.embedding import embed_query_cached
from app.services.llm import LLMService
from app.services.rag import retrieve_rag_context

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def _title_from_message(text: str) -> str:
    t = " ".join(text.strip().split())
    if len(t) <= 80:
        return t or "New chat"
    return t[:77] + "..."


async def generate_reply_for_message(
    db: Session,
    conv: Conversation,
    user_message: str,
    *,
    redis,
) -> tuple[str, dict[str, int]]:
    doc_ids: list[uuid.UUID] = []
    if conv.mode == "rag":
        rows = db.scalars(
            select(ConversationDocument.document_id).where(
                ConversationDocument.conversation_id == conv.id
            )
        ).all()
        doc_ids = list(rows)

    rag_lines: list[str] = []
    if conv.mode == "rag" and doc_ids:
        try:
            q_emb = await embed_query_cached(redis, user_message)
            rag_lines = retrieve_rag_context(db, q_emb, doc_ids)
        except Exception as e:  # noqa: BLE001
            logger.warning("RAG retrieval failed: %s", e)
            rag_lines = []

    messages = build_messages_for_llm(
        db,
        conv.id,
        user_message,
        summary=conv.summary,
        rag_context_lines=rag_lines,
    )

    llm = LLMService()
    reply, usage = await llm.chat_completion(messages)
    return reply, usage


async def maybe_refresh_summary(db: Session, conv: Conversation) -> None:
    """If thread is long, compress older context into summary (best-effort)."""
    n = db.scalar(
        select(func.count()).select_from(Message).where(Message.conversation_id == conv.id)
    )
    if n is None or n < 32 or conv.summary:
        return
    if not settings.groq_api_key:
        return

    stmt = (
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.asc())
        .limit(40)
    )
    rows = list(db.scalars(stmt).all())
    if len(rows) < 20:
        return

    transcript = "\n".join(f"{m.role}: {m.content}" for m in rows[:35])
    summarize_prompt = [
        {
            "role": "system",
            "content": "Summarize the following dialogue in at most 150 tokens. Preserve facts and decisions.",
        },
        {"role": "user", "content": transcript},
    ]
    llm = LLMService()
    try:
        text, _usage = await llm.chat_completion(summarize_prompt, max_tokens=200)
        conv.summary = text.strip()[:8000]
        db.add(conv)
    except Exception as e:  # noqa: BLE001
        logger.warning("Summarization skipped: %s", e)
