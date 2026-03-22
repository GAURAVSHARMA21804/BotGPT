from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    user_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    context_used: list[str] = Field(default_factory=list)


class ChatMessageBody(BaseModel):
    """Body from client — user comes from JWT."""

    message: str
