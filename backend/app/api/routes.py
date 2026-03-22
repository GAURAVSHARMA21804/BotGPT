from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.security import get_current_user_id
from app.models.chat import ChatMessageBody, ChatRequest, ChatResponse
from app.services.conversation import ConversationService


router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatMessageBody,
    user_id: UUID = Depends(get_current_user_id),
) -> ChatResponse:
    service = ConversationService()
    return await service.handle_chat(
        ChatRequest(user_id=str(user_id), message=payload.message)
    )
