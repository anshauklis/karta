import httpx

TG_API = "https://api.telegram.org"


async def send_message(bot_token: str, chat_id: str, text: str) -> dict:
    """Send a text message to a Telegram chat."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{TG_API}/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        )
        return resp.json()


async def send_file(bot_token: str, chat_id: str, file_bytes: bytes,
                    filename: str, caption: str = "") -> dict:
    """Send a document to a Telegram chat."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{TG_API}/bot{bot_token}/sendDocument",
            data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
            files={"document": (filename, file_bytes)},
        )
        return resp.json()
