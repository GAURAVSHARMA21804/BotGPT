import httpx

from app.core.config import settings


class LLMService:
    async def generate_reply(self, prompt: str, context: list[str]) -> str:
        if not settings.openai_api_key:
            return f"[MOCK] {prompt} | context={len(context)}"

        body = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "You are BOT GPT."},
                {"role": "user", "content": f"Context: {context}\n\nPrompt: {prompt}"},
            ],
        }
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                json=body,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
