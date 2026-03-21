from fastapi import APIRouter, Depends

from app.core.security import verify_token
from app.models.chat import ChatRequest, ChatResponse
from app.services.conversation import ConversationService


router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    _auth: str = Depends(verify_token),
) -> ChatResponse:
    service = ConversationService()
    return await service.handle_chat(payload)
