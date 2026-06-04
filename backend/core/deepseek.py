"""
DeepSeek Inference Client
Streams token-by-token completions from the DeepSeek Chat API via SSE.
"""

import json
import os
from collections.abc import AsyncGenerator

import httpx
from dotenv import load_dotenv

load_dotenv()

_DEEPSEEK_API_KEY: str = os.environ["DEEPSEEK_API_KEY"]
_DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
_MODEL: str = "deepseek-chat"
_TEMPERATURE: float = 0.1


async def stream_chat(messages: list[dict[str, str]]) -> AsyncGenerator[str, None]:
    """
    Async generator that streams token chunks from the DeepSeek Chat API.

    Args:
        messages: OpenAI-compatible message list, e.g.
            [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]

    Yields:
        Individual token strings as they arrive from the stream.

    Raises:
        httpx.HTTPStatusError: if DeepSeek returns a non-2xx response.
        RuntimeError: if the stream is unexpectedly closed or malformed.
    """
    headers = {
        "Authorization": f"Bearer {_DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _MODEL,
        "messages": messages,
        "temperature": _TEMPERATURE,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{_DEEPSEEK_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
            ) as response:
                response.raise_for_status()
                async for raw_line in response.aiter_lines():
                    stripped = raw_line.strip()
                    if not stripped or not stripped.startswith("data:"):
                        continue
                    data = stripped[len("data:"):].strip()
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"]
                        content = delta.get("content")
                        if content:
                            yield content
                    except (KeyError, IndexError, json.JSONDecodeError):
                        # Malformed chunk — skip silently.
                        continue
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"DeepSeek API error {exc.response.status_code}: {exc.response.text}"
            ) from exc
