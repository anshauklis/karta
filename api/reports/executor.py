import asyncio
import io
import logging
import secrets
from datetime import datetime

import pandas as pd
from sqlalchemy import text

from api.database import engine
from api.charts.router import _execute_chart_full
from api.notifications.dispatcher import send_file

logger = logging.getLogger("karta.reports")


async def execute_report(report_id: int) -> dict:
    """Execute a scheduled report: run chart SQL -> file -> send to channel.

    Supports three formats:
      - excel: Execute chart SQL, build .xlsx, send
      - png / pdf: Create a temporary share link for the chart's dashboard,
        capture a headless-browser screenshot, send the image/PDF, then
        clean up the temporary share link.
    """
    report = await asyncio.to_thread(_fetch_report, report_id)
    report_format = report.get("format", "excel")

    if report_format in ("png", "pdf"):
        file_bytes, filename = await _run_screenshot_report(report, report_format)
        row_count = 0
    else:
        # Default: Excel
        _, file_bytes, filename, row_count = await asyncio.to_thread(
            _run_excel_report, report
        )

    # Update last_run_at
    await asyncio.to_thread(_update_last_run, report_id)

    # Send to channel (async HTTP)
    if report["channel_id"]:
        await _send_to_channel(report, file_bytes, filename)

    return {
        "report_id": report_id,
        "rows": row_count,
        "filename": filename,
        "format": report_format,
        "sent": bool(report["channel_id"]),
    }


def _fetch_report(report_id: int) -> dict:
    """Fetch report metadata joined with chart info."""
    with engine.connect() as conn:
        report = conn.execute(
            text("""
                SELECT r.id, r.name, r.chart_id, r.channel_id,
                    COALESCE(r.format, 'excel') as format,
                    c.connection_id, c.sql_query, c.title as chart_title,
                    c.dashboard_id
                FROM scheduled_reports r
                JOIN charts c ON c.id = r.chart_id
                WHERE r.id = :id
            """),
            {"id": report_id},
        ).mappings().fetchone()

    if not report:
        raise ValueError(f"Report {report_id} not found")

    return dict(report)


def _run_excel_report(report: dict) -> tuple[dict, bytes, str, int]:
    """Execute chart SQL, build Excel bytes."""
    if not report["sql_query"] or not report["connection_id"]:
        raise ValueError(f"Report {report['id']}: chart has no SQL or connection")

    columns, rows, df, _pq_path = _execute_chart_full(report["connection_id"], report["sql_query"], chart_config={}, skip_metrics=True)

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Report")
    excel_bytes = buf.getvalue()

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"{report['name']}_{timestamp}.xlsx"

    return report, excel_bytes, filename, len(rows)


async def _run_screenshot_report(report: dict, fmt: str) -> tuple[bytes, str]:
    """Capture a dashboard screenshot as PNG or PDF.

    If the chart belongs to a dashboard, creates a temporary share link,
    captures the screenshot, and cleans up. If the chart has no dashboard,
    falls back to Excel export.
    """
    dashboard_id = report.get("dashboard_id")
    if not dashboard_id:
        raise ValueError(
            f"Report {report['id']}: chart has no dashboard. "
            f"PNG/PDF export requires a dashboard. Use 'excel' format for standalone charts."
        )

    # Create a temporary share link
    token = await asyncio.to_thread(_create_temp_share_link, dashboard_id)

    try:
        from api.screenshot import capture_dashboard
        file_bytes = await capture_dashboard(token, format=fmt)
    finally:
        # Always clean up the temporary share link
        await asyncio.to_thread(_delete_share_link_by_token, token)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    ext = "pdf" if fmt == "pdf" else "png"
    filename = f"{report['name']}_{timestamp}.{ext}"

    return file_bytes, filename


def _create_temp_share_link(dashboard_id: int) -> str:
    """Create a temporary share link for screenshot capture."""
    token = secrets.token_urlsafe(32)
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO shared_links (dashboard_id, token, created_by, expires_at)
                VALUES (:did, :token, NULL, NOW() + INTERVAL '5 minutes')
            """),
            {"did": dashboard_id, "token": token},
        )
        conn.commit()
    return token


def _delete_share_link_by_token(token: str):
    """Delete a share link by its token."""
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM shared_links WHERE token = :token"),
            {"token": token},
        )
        conn.commit()


def _update_last_run(report_id: int):
    """Update the last_run_at timestamp."""
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE scheduled_reports SET last_run_at = NOW() WHERE id = :id"),
            {"id": report_id},
        )
        conn.commit()


async def _send_to_channel(report: dict, file_bytes: bytes, filename: str):
    """Send the generated file to the report's notification channel."""
    def _fetch_channel():
        with engine.connect() as conn:
            return conn.execute(
                text("SELECT channel_type, config FROM notification_channels WHERE id = :id"),
                {"id": report["channel_id"]},
            ).mappings().fetchone()

    channel = await asyncio.to_thread(_fetch_channel)
    if channel:
        from api.notifications.router import _decrypt_config
        channel_config = _decrypt_config(channel["config"])
        await send_file(
            channel["channel_type"], channel_config,
            file_bytes, filename,
            title=report["name"],
            message=f"Report: {report['name']} ({report['chart_title']})",
        )
