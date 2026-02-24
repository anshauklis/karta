import httpx

SLACK_API = "https://slack.com/api"


async def send_message(bot_token: str, channel_id: str, text: str) -> dict:
    """Send a text message to a Slack channel."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SLACK_API}/chat.postMessage",
            headers={"Authorization": f"Bearer {bot_token}"},
            json={"channel": channel_id, "text": text, "mrkdwn": True},
        )
        return resp.json()


async def send_file(bot_token: str, channel_id: str, file_bytes: bytes,
                    filename: str, title: str = "", message: str = "") -> dict:
    """Upload a file to a Slack channel."""
    async with httpx.AsyncClient(timeout=60) as client:
        # Step 1: get upload URL
        resp = await client.post(
            f"{SLACK_API}/files.getUploadURLExternal",
            headers={"Authorization": f"Bearer {bot_token}"},
            data={"filename": filename, "length": len(file_bytes)},
        )
        data = resp.json()
        if not data.get("ok"):
            return data

        upload_url = data["upload_url"]
        file_id = data["file_id"]

        # Step 2: upload file content
        await client.post(upload_url, content=file_bytes)

        # Step 3: complete upload and share to channel
        resp = await client.post(
            f"{SLACK_API}/files.completeUploadExternal",
            headers={"Authorization": f"Bearer {bot_token}"},
            json={
                "files": [{"id": file_id, "title": title or filename}],
                "channel_id": channel_id,
                "initial_comment": message,
            },
        )
        return resp.json()
