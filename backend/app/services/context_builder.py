from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db_models import Message
from app.services.chunking import count_tokens
from app.services.llm import SYSTEM_PROMPT

if TYPE_CHECKING:
    pass


def build_messages_for_llm(
    db: Session,
    conversation_id: uuid.UUID,
    user_message: str,
    *,
    summary: str | None,
    rag_context_lines: list[str],
) -> list[dict[str, str]]:
    """
    Order: system (persona + optional RAG header), optional summary, sliding window of history, user message.
    """
    budget = settings.context_token_budget - settings.max_completion_tokens - settings.context_safety_margin
    if budget < 500:
        budget = 500

    sys_parts = [SYSTEM_PROMPT]
    if rag_context_lines:
        sys_parts.append(
            "Use the following document excerpts to answer when in RAG mode:\n\n"
            + "\n\n---\n\n".join(rag_context_lines)
        )
    system_content = "\n\n".join(sys_parts)
    system_tokens = count_tokens(system_content)

    summary_block = ""
    if summary:
        summary_block = f"Earlier conversation summary:\n{summary}\n"
    summary_tokens = count_tokens(summary_block) if summary_block else 0

    # Remaining budget for prior turns + current user message
    user_tok = count_tokens(user_message)
    remaining = budget - system_tokens - summary_tokens - user_tok
    if remaining < 0:
        remaining = 0

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
    )
    rows = list(db.scalars(stmt).all())

    picked: list[Message] = []
    used = 0
    for m in rows:
        mtoks = count_tokens(m.content)
        if used + mtoks > remaining:
            break
        picked.append(m)
        used += mtoks

    picked.reverse()

    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    if summary_block:
        messages.append({"role": "system", "content": summary_block.strip()})
    for m in picked:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": user_message})
    return messages
