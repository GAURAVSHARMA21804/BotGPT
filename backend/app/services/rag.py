from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db_models import Document, DocumentChunk


def retrieve_rag_context(
    db: Session,
    query_embedding: list[float],
    document_ids: list[uuid.UUID],
) -> list[str]:
    if not document_ids:
        return []

    stmt = (
        select(DocumentChunk)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            Document.status == "ready",
            DocumentChunk.document_id.in_(document_ids),
        )
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(settings.rag_top_k * 3)
    )
    rows = list(db.scalars(stmt).all())

    texts: list[str] = []
    used = 0
    budget = settings.rag_chunk_token_budget
    for row in rows:
        if len(texts) >= settings.rag_top_k:
            break
        if used + row.token_count > budget:
            if not texts:
                texts.append(row.content[: budget * 4])
            break
        texts.append(row.content)
        used += row.token_count
    return texts
