from api.notifications import slack, telegram, email


async def send_message(channel_type: str, config: dict, text: str) -> dict:
    """Send text message to the appropriate channel."""
    if channel_type == "slack":
        return await slack.send_message(config["bot_token"], config["channel_id"], text)
    elif channel_type == "telegram":
        return await telegram.send_message(config["bot_token"], config["chat_id"], text)
    elif channel_type == "email":
        return await email.send_message(config["recipients"], text, subject=config.get("subject", "Karta Notification"))
    raise ValueError(f"Unknown channel type: {channel_type}")


async def send_file(channel_type: str, config: dict, file_bytes: bytes,
                    filename: str, title: str = "", message: str = "") -> dict:
    """Send file to the appropriate channel."""
    if channel_type == "slack":
        return await slack.send_file(
            config["bot_token"], config["channel_id"],
            file_bytes, filename, title=title, message=message,
        )
    elif channel_type == "telegram":
        return await telegram.send_file(
            config["bot_token"], config["chat_id"],
            file_bytes, filename, caption=message,
        )
    elif channel_type == "email":
        return await email.send_file(
            config["recipients"], file_bytes, filename,
            caption=message, subject=config.get("subject", "Karta Report"),
        )
    raise ValueError(f"Unknown channel type: {channel_type}")
