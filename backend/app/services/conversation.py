from app.models.chat import ChatRequest, ChatResponse
from app.services.llm import LLMService, SYSTEM_PROMPT


class ConversationService:
    """Legacy non-persistent /chat — use POST /api/v1/conversations for stored history."""

    def __init__(self) -> None:
        self.llm = LLMService()

    async def handle_chat(self, request: ChatRequest) -> ChatResponse:
        reply, _usage = await self.llm.chat_completion(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.message},
            ]
        )
        return ChatResponse(reply=reply, context_used=[])
