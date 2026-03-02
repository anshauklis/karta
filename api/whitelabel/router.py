import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text

from database import engine
from license import require_feature
from auth.dependencies import get_current_user, require_admin

logger = logging.getLogger("karta.whitelabel")
router = APIRouter(prefix="/api/tenant", tags=["whitelabel"])

UPLOAD_DIR = "data/tenant"

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"}


class WhitelabelSettings(BaseModel):
    app_name: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None
    custom_css: str | None = None


DEFAULT_SETTINGS = {
    "app_name": "Karta",
    "logo_url": None,
    "favicon_url": None,
    "primary_color": "#2563eb",
    "accent_color": "#7c3aed",
    "custom_css": "",
}


@router.get("/settings")
async def get_tenant_settings():
    """Return white-label settings for the default tenant. Public endpoint."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT settings FROM tenants WHERE id = 1")
        ).fetchone()
        if not row:
            return DEFAULT_SETTINGS
        settings = {**DEFAULT_SETTINGS, **(row[0] or {})}
        return settings


@router.put("/settings")
async def update_tenant_settings(
    body: WhitelabelSettings,
    current_user: dict = Depends(get_current_user),
    _admin=Depends(require_admin),
    _lic=Depends(require_feature("whitelabel")),
):
    """Update white-label settings. Admin + whitelabel license required."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT settings FROM tenants WHERE id = 1")
        ).fetchone()
        current = row[0] if row else {}
        merged = {**DEFAULT_SETTINGS, **(current or {}), **updates}
        conn.execute(
            text("UPDATE tenants SET settings = :s WHERE id = 1"),
            {"s": json.dumps(merged)},
        )
        conn.commit()
        logger.info(
            "Whitelabel settings updated by user %s", current_user.get("sub")
        )
        return merged


def _save_upload(upload: UploadFile, kind: str) -> str:
    """Save an uploaded file and return the serving URL path."""
    if not upload.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(upload.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    dest_dir = Path(UPLOAD_DIR) / "1"
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Remove any existing files for this kind (logo/favicon)
    for existing in dest_dir.glob(f"{kind}.*"):
        existing.unlink(missing_ok=True)

    dest_path = dest_dir / f"{kind}{ext}"
    contents = upload.file.read()
    dest_path.write_bytes(contents)

    url = f"/api/tenant/{kind}"
    logger.info("Uploaded %s: %s (%d bytes)", kind, dest_path, len(contents))
    return url


def _find_file(kind: str) -> Path | None:
    """Find the uploaded file for the given kind (logo/favicon)."""
    dest_dir = Path(UPLOAD_DIR) / "1"
    if not dest_dir.exists():
        return None
    for f in dest_dir.glob(f"{kind}.*"):
        if f.suffix.lower() in ALLOWED_IMAGE_EXTENSIONS:
            return f
    return None


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    _admin=Depends(require_admin),
    _lic=Depends(require_feature("whitelabel")),
):
    """Upload a custom logo. Admin + whitelabel license required."""
    url = _save_upload(file, "logo")

    # Update the logo_url in tenant settings
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT settings FROM tenants WHERE id = 1")
        ).fetchone()
        current = row[0] if row else {}
        merged = {**DEFAULT_SETTINGS, **(current or {}), "logo_url": url}
        conn.execute(
            text("UPDATE tenants SET settings = :s WHERE id = 1"),
            {"s": json.dumps(merged)},
        )
        conn.commit()

    return {"url": url}


@router.post("/favicon")
async def upload_favicon(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    _admin=Depends(require_admin),
    _lic=Depends(require_feature("whitelabel")),
):
    """Upload a custom favicon. Admin + whitelabel license required."""
    url = _save_upload(file, "favicon")

    # Update the favicon_url in tenant settings
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT settings FROM tenants WHERE id = 1")
        ).fetchone()
        current = row[0] if row else {}
        merged = {**DEFAULT_SETTINGS, **(current or {}), "favicon_url": url}
        conn.execute(
            text("UPDATE tenants SET settings = :s WHERE id = 1"),
            {"s": json.dumps(merged)},
        )
        conn.commit()

    return {"url": url}


@router.get("/logo")
async def serve_logo():
    """Serve the uploaded logo file. Public endpoint."""
    path = _find_file("logo")
    if not path:
        raise HTTPException(status_code=404, detail="No logo uploaded")
    media_type = _media_type(path)
    return FileResponse(str(path), media_type=media_type)


@router.get("/favicon")
async def serve_favicon():
    """Serve the uploaded favicon file. Public endpoint."""
    path = _find_file("favicon")
    if not path:
        raise HTTPException(status_code=404, detail="No favicon uploaded")
    media_type = _media_type(path)
    return FileResponse(str(path), media_type=media_type)


def _media_type(path: Path) -> str:
    """Return the MIME type for the given file extension."""
    ext = path.suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")
