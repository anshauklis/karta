import asyncio
import io
import logging
from datetime import datetime

import pandas as pd
from sqlalchemy import text

from api.database import engine
from api.charts.router import _execute_chart_sql
from api.notifications.dispatcher import send_file

logger = logging.getLogger("karta.reports")


async def execute_report(report_id: int) -> dict:
    """Execute a scheduled report: run chart SQL → Excel → send to channel."""
    report, excel_bytes, filename, row_count = await asyncio.to_thread(
        _run_report_sync, report_id
    )

    # Send to channel (async HTTP)
    if report["channel_id"]:
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
                excel_bytes, filename,
                title=report["name"],
                message=f"Report: {report['name']} ({report['chart_title']})",
            )

    return {
        "report_id": report_id,
        "rows": row_count,
        "filename": filename,
        "sent": bool(report["channel_id"]),
    }


def _run_report_sync(report_id: int) -> tuple[dict, bytes, str, int]:
    """Sync: fetch report, execute SQL, build Excel, update last_run."""
    with engine.connect() as conn:
        report = conn.execute(
            text("""
                SELECT r.id, r.name, r.chart_id, r.channel_id,
                    c.connection_id, c.sql_query, c.title as chart_title
                FROM scheduled_reports r
                JOIN charts c ON c.id = r.chart_id
                WHERE r.id = :id
            """),
            {"id": report_id},
        ).mappings().fetchone()

    if not report:
        raise ValueError(f"Report {report_id} not found")

    if not report["sql_query"] or not report["connection_id"]:
        raise ValueError(f"Report {report_id}: chart has no SQL or connection")

    columns, rows, df = _execute_chart_sql(report["connection_id"], report["sql_query"])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Report")
    excel_bytes = buf.getvalue()

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"{report['name']}_{timestamp}.xlsx"

    with engine.connect() as conn:
        conn.execute(
            text("UPDATE scheduled_reports SET last_run_at = NOW() WHERE id = :id"),
            {"id": report_id},
        )
        conn.commit()

    return dict(report), excel_bytes, filename, len(rows)
