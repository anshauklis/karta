import asyncio
import api.json_util as json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from api.database import engine
from api.auth.dependencies import get_current_user, require_admin
from api.crypto import encrypt_password_safe, decrypt_password_safe

router = APIRouter(tags=["notifications"])


class ChannelCreate(BaseModel):
    name: str
    channel_type: str  # 'slack' | 'telegram' | 'email'
    config: dict  # slack: {bot_token, channel_id}; telegram: {bot_token, chat_id}; email: {recipients, subject?}


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None


class ChannelResponse(BaseModel):
    id: int
    name: str
    channel_type: str
    config: dict
    is_active: bool
    created_by: Optional[int]
    created_at: str


_SENSITIVE_KEYS = ("bot_token", "password", "api_key", "secret")


def _encrypt_config(config: dict) -> dict:
    """Encrypt sensitive fields in channel config before storage."""
    result = dict(config)
    for key in _SENSITIVE_KEYS:
        if key in result and isinstance(result[key], str) and result[key]:
            result[key] = encrypt_password_safe(result[key])
            result[f"_{key}_encrypted"] = True
    return result


def _decrypt_config(config: dict) -> dict:
    """Decrypt sensitive fields in channel config for internal use."""
    result = dict(config)
    for key in _SENSITIVE_KEYS:
        if result.get(f"_{key}_encrypted") and key in result:
            try:
                result[key] = decrypt_password_safe(result[key])
            except Exception:
                pass
            del result[f"_{key}_encrypted"]
    return result


def _mask_config(config: dict) -> dict:
    """Mask sensitive fields in channel config for API responses."""
    masked = dict(config)
    for key in _SENSITIVE_KEYS:
        # Remove internal encryption markers
        masked.pop(f"_{key}_encrypted", None)
        if key in masked and isinstance(masked[key], str) and len(masked[key]) > 4:
            masked[key] = "***" + masked[key][-4:]
    return masked


@router.get("/api/channels", response_model=list[ChannelResponse], summary="List notification channels")
def list_channels(current_user: dict = Depends(get_current_user)):
    """Return all notification channels (Slack, Telegram, email) ordered by creation date."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, name, channel_type, config, is_active, created_by, created_at "
            "FROM notification_channels ORDER BY created_at DESC"
        )).mappings().all()
    result = []
    for r in rows:
        d = dict(r)
        d["config"] = _mask_config(d["config"])
        result.append(d)
    return result


@router.post("/api/channels", response_model=ChannelResponse, status_code=201, summary="Create notification channel")
def create_channel(req: ChannelCreate, current_user: dict = Depends(require_admin)):
    """Create a new notification channel (Slack, Telegram, or email)."""
    if req.channel_type not in ("slack", "telegram", "email"):
        raise HTTPException(400, "channel_type must be 'slack', 'telegram', or 'email'")

    user_id = int(current_user["sub"])
    encrypted_config = _encrypt_config(req.config)
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO notification_channels (name, channel_type, config, created_by)
                VALUES (:name, :channel_type, CAST(:config AS jsonb), :created_by)
                RETURNING id, name, channel_type, config, is_active, created_by, created_at
            """),
            {"name": req.name, "channel_type": req.channel_type,
             "config": json.dumps(encrypted_config), "created_by": user_id},
        ).mappings().fetchone()
        conn.commit()
    d = dict(row)
    d["config"] = _mask_config(d["config"])
    return d


@router.put("/api/channels/{channel_id}", response_model=ChannelResponse, summary="Update notification channel")
def update_channel(channel_id: int, req: ChannelUpdate, current_user: dict = Depends(require_admin)):
    """Update a notification channel's name, config, or active status."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "config" in updates:
        updates["config"] = json.dumps(_encrypt_config(updates["config"]))
        set_clauses = ", ".join(
            f"{k} = CAST(:{k} AS jsonb)" if k == "config" else f"{k} = :{k}"
            for k in updates
        )
    else:
        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    updates["id"] = channel_id
    with engine.connect() as conn:
        conn.execute(text(f"UPDATE notification_channels SET {set_clauses} WHERE id = :id"), updates)
        conn.commit()
        row = conn.execute(
            text("SELECT id, name, channel_type, config, is_active, created_by, created_at "
                 "FROM notification_channels WHERE id = :id"),
            {"id": channel_id},
        ).mappings().fetchone()
    if not row:
        raise HTTPException(404, "Channel not found")
    d = dict(row)
    d["config"] = _mask_config(d["config"])
    return d


@router.delete("/api/channels/{channel_id}", status_code=204, summary="Delete notification channel")
def delete_channel(channel_id: int, current_user: dict = Depends(require_admin)):
    """Permanently delete a notification channel."""
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM notification_channels WHERE id = :id"), {"id": channel_id})
        conn.commit()


@router.post("/api/channels/{channel_id}/test", summary="Test notification channel")
async def test_channel(channel_id: int, current_user: dict = Depends(get_current_user)):
    """Send a test message through the channel to verify its configuration."""
    def _fetch():
        with engine.connect() as conn:
            return conn.execute(
                text("SELECT channel_type, config FROM notification_channels WHERE id = :id"),
                {"id": channel_id},
            ).mappings().fetchone()

    row = await asyncio.to_thread(_fetch)
    if not row:
        raise HTTPException(404, "Channel not found")

    from api.notifications.dispatcher import send_message
    config = _decrypt_config(row["config"])
    try:
        result = await send_message(
            row["channel_type"], config,
            "Karta test notification. If you see this, the channel is configured correctly.",
        )
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
