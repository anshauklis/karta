import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.database import ensure_schema, ensure_migrations, ensure_system_connections
from api.scheduler import start_scheduler, shutdown_scheduler

_security_logger = logging.getLogger("karta.security")

_WEAK_SECRETS = {
    "change-me-in-production", "your-jwt-secret-here", "your-connection-secret-here",
    "CHANGE_ME", "karta", "dev-secret", "secret", "",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Security: refuse to start with weak secrets
    jwt_secret = os.environ.get("JWT_SECRET", "")
    conn_secret = os.environ.get("CONNECTION_SECRET", "")
    if jwt_secret in _WEAK_SECRETS or len(jwt_secret) < 16:
        raise SystemExit(
            "FATAL: JWT_SECRET is weak, default, or missing. "
            "Generate a strong secret: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    if conn_secret in _WEAK_SECRETS or len(conn_secret) < 16:
        raise SystemExit(
            "FATAL: CONNECTION_SECRET is weak, default, or missing. "
            "Generate a strong secret: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )

    ensure_schema()
    ensure_migrations()
    ensure_system_connections()
    start_scheduler()
    yield
    shutdown_scheduler()


_disable_docs = os.environ.get("DISABLE_DOCS", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="Karta API",
    description=(
        "Karta is a self-hosted BI platform. This API provides endpoints for:\n\n"
        "- **Dashboards** — Create and manage dashboards with grid layout\n"
        "- **Charts** — 21+ chart types with visual and code modes\n"
        "- **Connections** — Connect to PostgreSQL, MySQL, MSSQL, ClickHouse, DuckDB\n"
        "- **Datasets** — Virtual (SQL) and physical (table) data sources\n"
        "- **Filters** — Dashboard filters with cascading dependencies\n"
        "- **SQL Lab** — Execute ad-hoc SQL queries\n"
        "- **AI Assistant** — Chat-based data exploration with tool-use\n"
        "- **Alerts & Reports** — Scheduled monitoring and reporting\n"
        "- **Stories** — Narrative presentations with chart slides\n\n"
        "## Authentication\n"
        "All endpoints (except `/api/health` and `/api/shared/{token}`) require JWT authentication. "
        "Obtain a token via `POST /api/auth/login` and pass it as `Authorization: Bearer <token>`."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if _disable_docs else "/docs",
    redoc_url=None if _disable_docs else "/redoc",
    openapi_url=None if _disable_docs else "/openapi.json",
    openapi_tags=[
        {"name": "auth", "description": "Authentication and user management"},
        {"name": "dashboards", "description": "Dashboard CRUD and layout"},
        {"name": "charts", "description": "Chart CRUD, execute, and preview"},
        {"name": "connections", "description": "Database connections and schema introspection"},
        {"name": "datasets", "description": "Virtual and physical datasets"},
        {"name": "filters", "description": "Dashboard filters and cascading"},
        {"name": "tabs", "description": "Dashboard tabs"},
        {"name": "bookmarks", "description": "Saved filter states"},
        {"name": "annotations", "description": "Chart and dashboard annotations"},
        {"name": "sql_lab", "description": "Ad-hoc SQL execution"},
        {"name": "sql_tabs", "description": "SQL Lab tabs"},
        {"name": "file-upload", "description": "CSV/Parquet upload to DuckDB"},
        {"name": "chart_drafts", "description": "Auto-saved chart drafts"},
        {"name": "templates", "description": "Chart templates"},
        {"name": "alerts", "description": "Alert rules and history"},
        {"name": "notifications", "description": "Notification channels (Slack, Telegram, email)"},
        {"name": "reports", "description": "Scheduled chart reports"},
        {"name": "stories", "description": "Narrative presentations"},
        {"name": "ai", "description": "AI assistant, SQL generation, glossary"},
        {"name": "rls", "description": "Row-Level Security rules (admin)"},
        {"name": "analytics", "description": "Usage analytics (admin)"},
        {"name": "lineage", "description": "Data lineage graph"},
        {"name": "favorites", "description": "User favorites"},
        {"name": "export", "description": "Dashboard share links"},
        {"name": "Meta", "description": "Chart configuration schemas and metadata"},
    ],
)

_cors_raw = os.environ.get("CORS_ORIGINS", "")
if _cors_raw:
    _cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
else:
    _nextauth_url = os.environ.get("NEXTAUTH_URL", "http://localhost:3001")
    _cors_origins = [_nextauth_url]
    _security_logger.info("CORS_ORIGINS not set — defaulting to %s", _nextauth_url)

if "*" in _cors_origins:
    _security_logger.warning("CORS_ORIGINS contains wildcard '*' — this is insecure in production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from api.auth.router import router as auth_router
from api.dashboards.router import router as dashboards_router
from api.connections.router import router as connections_router
from api.sql_lab.router import router as sql_lab_router
from api.datasets.router import router as datasets_router
from api.charts.router import router as charts_router
from api.notifications.router import router as notifications_router
from api.alerts.router import router as alerts_router
from api.reports.router import router as reports_router
from api.filters.router import router as filters_router
from api.analytics.router import router as analytics_router
from api.rls.router import router as rls_router
from api.bookmarks.router import router as bookmarks_router
from api.annotations.router import router as annotations_router
from api.stories.router import router as stories_router
from api.lineage.router import router as lineage_router
from api.export.router import router as export_router
from api.csv_upload.router import router as csv_router
from api.sql_tabs.router import router as sql_tabs_router
from api.drafts.router import router as drafts_router
from api.ai.router import router as ai_router
from api.favorites.router import router as favorites_router
from api.templates.router import router as templates_router
from api.tabs.router import router as tabs_router
from api.meta.router import router as meta_router

app.include_router(auth_router)
app.include_router(dashboards_router)
app.include_router(connections_router)
app.include_router(sql_lab_router)
app.include_router(datasets_router)
app.include_router(charts_router)
app.include_router(notifications_router)
app.include_router(alerts_router)
app.include_router(reports_router)
app.include_router(filters_router)
app.include_router(analytics_router)
app.include_router(rls_router)
app.include_router(bookmarks_router)
app.include_router(annotations_router)
app.include_router(stories_router)
app.include_router(lineage_router)
app.include_router(export_router)
app.include_router(csv_router)
app.include_router(sql_tabs_router)
app.include_router(drafts_router)
app.include_router(ai_router)
app.include_router(favorites_router)
app.include_router(templates_router)
app.include_router(tabs_router)
app.include_router(meta_router)


@app.get("/api/health", summary="Health check", tags=["system"])
def health():
    """Return API health status. No authentication required."""
    return {"status": "ok"}


# --- Generic change history endpoint ---
from fastapi import Depends
from sqlalchemy import text as sa_text
from api.database import engine as db_engine
from api.auth.dependencies import get_current_user as _get_user
from api.models import ChangeHistoryResponse


@app.get("/api/history/{entity_type}/{entity_id}", response_model=list[ChangeHistoryResponse], summary="Get entity change history", tags=["system"])
def get_entity_history(entity_type: str, entity_id: int, current_user: dict = Depends(_get_user)):
    """Return the last 50 change history entries for any entity (dashboard, chart, etc.)."""
    with db_engine.connect() as conn:
        result = conn.execute(sa_text("""
            SELECT h.id, h.entity_type, h.entity_id, h.user_id, u.name as user_name,
                   h.action, h.changes, h.created_at
            FROM change_history h
            LEFT JOIN users u ON u.id = h.user_id
            WHERE h.entity_type = :et AND h.entity_id = :eid
            ORDER BY h.created_at DESC
            LIMIT 50
        """), {"et": entity_type, "eid": entity_id})
        return [dict(row) for row in result.mappings().all()]
