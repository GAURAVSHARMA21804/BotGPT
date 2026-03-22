from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db_models import Document, DocumentChunk
from app.services.chunking import chunk_text_recursive, count_tokens
from app.services.embedding import embed_texts_sync

logger = logging.getLogger(__name__)


def _extract_text_pdf(path: str) -> str:
    reader = PdfReader(path)
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text()
            if t:
                parts.append(t)
        except Exception as e:  # noqa: BLE001
            logger.warning("PDF page extract failed: %s", e)
    return "\n\n".join(parts)


def ingest_document_sync(document_id: uuid.UUID) -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _ingest_document(db, document_id)
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.exception("Document ingest failed: %s", e)
        try:
            row = db.get(Document, document_id)
            if row:
                row.status = "failed"
                row.error_message = str(e)[:2000]
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


def _ingest_document(db: Session, document_id: uuid.UUID) -> None:
    doc = db.get(Document, document_id)
    if not doc:
        return

    if not settings.openai_api_key:
        doc.status = "failed"
        doc.error_message = "OPENAI_API_KEY is not set; cannot embed chunks."
        return

    doc.status = "processing"
    db.flush()

    path = doc.storage_path
    if not os.path.isfile(path):
        doc.status = "failed"
        doc.error_message = "Stored file missing on disk."
        return

    text = _extract_text_pdf(path)
    if not text.strip():
        doc.status = "failed"
        doc.error_message = "No extractable text from PDF."
        return

    pairs = chunk_text_recursive(text, max_tokens=512, overlap_tokens=64)
    if not pairs:
        doc.status = "failed"
        doc.error_message = "Chunking produced no content."
        return

    # Batch embeddings (OpenAI allows batch input)
    contents = [p[0] for p in pairs]
    token_counts = [p[1] if p[1] > 0 else count_tokens(p[0]) for p in pairs]

    embeddings = embed_texts_sync(contents)

    from sqlalchemy import delete

    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
    for i, (emb, content, tc) in enumerate(zip(embeddings, contents, token_counts, strict=True)):
        chunk = DocumentChunk(
            id=uuid.uuid4(),
            document_id=doc.id,
            chunk_index=i,
            content=content,
            token_count=tc,
            embedding=emb,
        )
        db.add(chunk)

    doc.chunk_count = len(contents)
    doc.status = "ready"
    doc.error_message = None


def save_upload_to_disk(user_id: uuid.UUID, doc_id: uuid.UUID, filename: str, data: bytes) -> str:
    base = Path(settings.upload_dir) / str(user_id)
    base.mkdir(parents=True, exist_ok=True)
    safe_name = f"{doc_id}_{Path(filename).name}"[:240]
    path = base / safe_name
    path.write_bytes(data)
    return str(path.resolve())
