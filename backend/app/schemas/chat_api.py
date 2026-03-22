from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class CreateConversationBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000)
    mode: Literal["open", "rag"] = "open"
    doc_ids: list[UUID] | None = None


class CreateConversationResponse(BaseModel):
    conv_id: UUID
    reply: str
    usage: TokenUsage


class ConversationListItem(BaseModel):
    conv_id: UUID
    title: str
    updated_at: datetime


class ConversationOut(BaseModel):
    conv_id: UUID
    title: str
    mode: str
    summary: str | None
    updated_at: datetime


class MessageOut(BaseModel):
    msg_id: UUID
    role: str
    content: str
    created_at: datetime


class ConversationDetailResponse(BaseModel):
    conv: ConversationOut
    messages: list[MessageOut]
    next_cursor: str | None = None


class AppendMessageBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000)


class AppendMessageResponse(BaseModel):
    msg_id: UUID
    reply: str
    usage: TokenUsage


class DocumentUploadResponse(BaseModel):
    doc_id: UUID
    status: str


class DocumentStatusResponse(BaseModel):
    status: str
    chunk_count: int
    error_message: str | None = None
