"""
Async LLM client for OpenAI-compatible APIs.

Supports: OpenAI, OpenRouter, Ollama, vLLM — anything that serves
/v1/chat/completions with the OpenAI request/response format.
"""

import os
import json
import logging
from typing import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

AI_API_URL = os.environ.get("AI_API_URL", "https://api.openai.com/v1")
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_MODEL = os.environ.get("AI_MODEL", "gpt-4o")
AI_ENABLED = os.environ.get("AI_ENABLED", "false").lower() in ("true", "1", "yes")

# Strip trailing slash for consistency
AI_API_URL = AI_API_URL.rstrip("/")


def is_ai_enabled() -> bool:
    return AI_ENABLED and bool(AI_API_KEY)


async def chat_completion(
    messages: list[dict],
    tools: list[dict] | None = None,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> dict:
    """
    Non-streaming chat completion. Returns the full response dict.

    Args:
        messages: OpenAI-format messages [{"role": ..., "content": ...}]
        tools: Optional list of tool definitions (OpenAI function calling format)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response

    Returns:
        The full API response as a dict (contains choices[0].message, usage, etc.)
    """
    payload: dict = {
        "model": AI_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers = {
        "Content-Type": "application/json",
    }
    if AI_API_KEY:
        headers["Authorization"] = f"Bearer {AI_API_KEY}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{AI_API_URL}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()


async def chat_completion_stream(
    messages: list[dict],
    tools: list[dict] | None = None,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> AsyncGenerator[dict, None]:
    """
    Streaming chat completion. Yields parsed SSE data chunks.

    Each yielded dict has OpenAI delta format:
    {"choices": [{"delta": {"content": "...", "tool_calls": [...]}}]}
    """
    payload: dict = {
        "model": AI_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers = {
        "Content-Type": "application/json",
    }
    if AI_API_KEY:
        headers["Authorization"] = f"Bearer {AI_API_KEY}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{AI_API_URL}/chat/completions",
            json=payload,
            headers=headers,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]  # strip "data: "
                if data.strip() == "[DONE]":
                    break
                try:
                    yield json.loads(data)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse SSE chunk: %s", data)


def _get_internal_token(user_id: int) -> str:
    """Generate a short-lived JWT for internal API calls."""
    from api.auth.jwt import JWT_SECRET, JWT_ALGORITHM
    import jwt
    from datetime import datetime, timedelta, timezone

    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
