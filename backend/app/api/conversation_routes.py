from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import try_get_redis
from app.core.responses import raise_http_error
from app.core.security import get_current_user
from app.database import get_db
from app.models.db_models import (
    Conversation,
    ConversationDocument,
    Document,
    Message,
    User,
)
from app.schemas.chat_api import (
    AppendMessageBody,
    AppendMessageResponse,
    ConversationDetailResponse,
    ConversationListItem,
    ConversationOut,
    CreateConversationBody,
    CreateConversationResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
    MessageOut,
    TokenUsage,
)
from app.services.context_builder import build_messages_for_llm
from app.services.conversation_pipeline import generate_reply_for_message, maybe_refresh_summary
from app.services.document_ingest import ingest_document_sync, save_upload_to_disk
from app.services.embedding import embed_query_cached
from app.services.llm import LLMService
from app.services.rag import retrieve_rag_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _touch_conv(conv: Conversation) -> None:
    conv.updated_at = datetime.now(timezone.utc)


def _title_from_message(text: str) -> str:
    t = " ".join(text.strip().split())
    if len(t) <= 80:
        return t or "New chat"
    return t[:77] + "..."


@router.post("", response_model=CreateConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: CreateConversationBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CreateConversationResponse:
    if body.mode == "rag" and body.doc_ids:
        for did in body.doc_ids:
            d = db.get(Document, did)
            if not d or d.user_id != user.id:
                raise_http_error(status.HTTP_404_NOT_FOUND, "Document not found")

    conv = Conversation(
        id=uuid.uuid4(),
        user_id=user.id,
        title=_title_from_message(body.message),
        mode=body.mode,
    )
    db.add(conv)
    db.flush()

    if body.mode == "rag" and body.doc_ids:
        for did in body.doc_ids:
            db.add(ConversationDocument(conversation_id=conv.id, document_id=did))

    redis = try_get_redis()
    try:
        reply, usage = await generate_reply_for_message(db, conv, body.message, redis=redis)
    except RuntimeError as e:
        raise_http_error(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))

    u_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        role="user",
        content=body.message,
        prompt_tokens=None,
        completion_tokens=None,
    )
    a_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        role="assistant",
        content=reply,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
    )
    db.add(u_msg)
    db.add(a_msg)
    _touch_conv(conv)
    db.commit()

    background_tasks.add_task(_run_summary, conv.id)

    return CreateConversationResponse(
        conv_id=conv.id,
        reply=reply,
        usage=TokenUsage(
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
        ),
    )


def _run_summary(conv_id: uuid.UUID) -> None:
    from app.database import SessionLocal

    s = SessionLocal()
    try:
        conv = s.get(Conversation, conv_id)
        if not conv:
            return
        import asyncio

        asyncio.run(_async_summary(s, conv))
        s.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning("Background summary failed: %s", e)
        s.rollback()
    finally:
        s.close()


async def _async_summary(db: Session, conv: Conversation) -> None:
    await maybe_refresh_summary(db, conv)


@router.get("", response_model=list[ConversationListItem])
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> list[ConversationListItem]:
    offset = (page - 1) * limit
    rows = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user.id, Conversation.deleted_at.is_(None))
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        ConversationListItem(conv_id=r.id, title=r.title, updated_at=r.updated_at) for r in rows
    ]


def _message_page(
    db: Session,
    conv_id: uuid.UUID,
    before: uuid.UUID | None,
    limit: int,
) -> tuple[list[Message], str | None]:
    q = select(Message).where(Message.conversation_id == conv_id)
    if before is not None:
        m = db.get(Message, before)
        if not m or m.conversation_id != conv_id:
            raise_http_error(status.HTTP_404_NOT_FOUND, "Cursor message not found")
        q = q.where(
            (Message.created_at < m.created_at)
            | ((Message.created_at == m.created_at) & (Message.id < m.id))
        )
    stmt = q.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1)
    rows = list(db.scalars(stmt).all())
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    rows.reverse()
    next_cursor = str(rows[0].id) if rows and has_more else None
    return rows, next_cursor


@router.get("/{conv_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conv_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    before: uuid.UUID | None = Query(None, description="Message id — load older messages before this id"),
) -> ConversationDetailResponse:
    conv = db.get(Conversation, conv_id)
    if not conv or conv.user_id != user.id or conv.deleted_at is not None:
        raise_http_error(status.HTTP_404_NOT_FOUND, "Conversation not found")

    msgs, next_cursor = _message_page(db, conv_id, before, limit)
    return ConversationDetailResponse(
        conv=ConversationOut(
            conv_id=conv.id,
            title=conv.title,
            mode=conv.mode,
            summary=conv.summary,
            updated_at=conv.updated_at,
        ),
        messages=[
            MessageOut(
                msg_id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at,
            )
            for m in msgs
        ],
        next_cursor=next_cursor,
    )


def _wants_stream(request: Request) -> bool:
    accept = request.headers.get("accept") or ""
    return "text/event-stream" in accept.lower()


@router.post("/{conv_id}/messages", response_model=AppendMessageResponse)
async def append_message(
    conv_id: uuid.UUID,
    body: AppendMessageBody,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppendMessageResponse | StreamingResponse:
    conv = db.get(Conversation, conv_id)
    if not conv or conv.user_id != user.id or conv.deleted_at is not None:
        raise_http_error(status.HTTP_404_NOT_FOUND, "Conversation not found")

    if _wants_stream(request):
        return await _append_message_stream(conv, body.message, db)

    redis = try_get_redis()
    try:
        reply, usage = await generate_reply_for_message(db, conv, body.message, redis=redis)
    except RuntimeError as e:
        raise_http_error(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))

    u_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        role="user",
        content=body.message,
        prompt_tokens=None,
        completion_tokens=None,
    )
    a_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        role="assistant",
        content=reply,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
    )
    db.add(u_msg)
    db.add(a_msg)
    _touch_conv(conv)
    db.commit()

    background_tasks.add_task(_run_summary, conv.id)

    return AppendMessageResponse(
        msg_id=u_msg.id,
        reply=reply,
        usage=TokenUsage(
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
        ),
    )


async def _append_message_stream(
    conv: Conversation,
    user_message: str,
    db: Session,
) -> StreamingResponse:
    redis = try_get_redis()
    doc_ids: list[uuid.UUID] = []
    if conv.mode == "rag":
        doc_ids = list(
            db.scalars(
                select(ConversationDocument.document_id).where(
                    ConversationDocument.conversation_id == conv.id
                )
            ).all()
        )

    rag_lines: list[str] = []
    if conv.mode == "rag" and doc_ids:
        try:
            q_emb = await embed_query_cached(redis, user_message)
            rag_lines = retrieve_rag_context(db, q_emb, doc_ids)
        except Exception as e:  # noqa: BLE001
            logger.warning("RAG retrieval failed (stream): %s", e)

    messages = build_messages_for_llm(
        db,
        conv.id,
        user_message,
        summary=conv.summary,
        rag_context_lines=rag_lines,
    )

    llm = LLMService()
    conv_id = conv.id

    async def gen():
        buf: list[str] = []
        try:
            async for line in llm.stream_chat(messages):
                buf.append(line)
                yield line
        finally:
            text = _parse_streamed_assistant_text("".join(buf))
            _persist_stream_turn(conv_id, user_message, text)

    return StreamingResponse(gen(), media_type="text/event-stream")


def _parse_streamed_assistant_text(raw: str) -> str:
    """Best-effort parse OpenAI-style SSE chunks."""
    parts: list[str] = []
    for line in raw.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:].strip()
        if payload == "[DONE]":
            break
        try:
            obj = json.loads(payload)
            delta = obj["choices"][0].get("delta") or {}
            c = delta.get("content")
            if c:
                parts.append(c)
        except (json.JSONDecodeError, KeyError, IndexError):
            continue
    return "".join(parts)


def _persist_stream_turn(conv_id: uuid.UUID, user_message: str, reply: str) -> None:
    from app.database import SessionLocal

    s = SessionLocal()
    try:
        conv = s.get(Conversation, conv_id)
        if not conv:
            return
        u_msg = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            role="user",
            content=user_message,
        )
        a_msg = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            role="assistant",
            content=reply or "",
        )
        s.add(u_msg)
        s.add(a_msg)
        _touch_conv(conv)
        s.commit()
    except Exception as e:  # noqa: BLE001
        logger.exception("Persist stream turn failed: %s", e)
        s.rollback()
    finally:
        s.close()


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conv_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    conv = db.get(Conversation, conv_id)
    if not conv or conv.user_id != user.id:
        raise_http_error(status.HTTP_404_NOT_FOUND, "Conversation not found")
    conv.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


documents_router = APIRouter(prefix="/documents", tags=["documents"])


@documents_router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    conv_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentUploadResponse:
    data = await file.read()
    max_b = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_b:
        raise_http_error(status.HTTP_400_BAD_REQUEST, f"File too large (max {settings.max_upload_mb} MB)")

    doc_id = uuid.uuid4()
    path = save_upload_to_disk(user.id, doc_id, file.filename or "upload.pdf", data)

    doc = Document(
        id=doc_id,
        user_id=user.id,
        filename=file.filename or "upload.pdf",
        mime_type=file.content_type,
        storage_path=path,
        status="pending",
    )
    db.add(doc)
    if conv_id is not None:
        conv = db.get(Conversation, conv_id)
        if not conv or conv.user_id != user.id or conv.deleted_at is not None:
            raise_http_error(status.HTTP_404_NOT_FOUND, "Conversation not found")
        db.add(ConversationDocument(conversation_id=conv.id, document_id=doc.id))
    db.commit()

    background_tasks.add_task(ingest_document_sync, doc.id)
    return DocumentUploadResponse(doc_id=doc.id, status=doc.status)


@documents_router.get("/{doc_id}/status", response_model=DocumentStatusResponse)
def document_status(
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentStatusResponse:
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise_http_error(status.HTTP_404_NOT_FOUND, "Document not found")
    return DocumentStatusResponse(
        status=doc.status,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
    )
