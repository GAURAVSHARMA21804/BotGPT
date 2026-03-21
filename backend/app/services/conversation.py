from app.models.chat import ChatRequest, ChatResponse
from app.services.llm import LLMService
from app.services.rag import RAGService


class ConversationService:
    def __init__(self) -> None:
        self.rag = RAGService()
        self.llm = LLMService()

    async def handle_chat(self, request: ChatRequest) -> ChatResponse:
        context = await self.rag.retrieve_context(request.message)
        reply = await self.llm.generate_reply(prompt=request.message, context=context)
        return ChatResponse(reply=reply, context_used=context)
