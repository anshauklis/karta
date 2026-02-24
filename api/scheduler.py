import asyncio
import fcntl
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("karta.scheduler")

scheduler = AsyncIOScheduler()
_lock_fd = None


def start_scheduler():
    """Start the scheduler and load all active jobs from DB.
    Uses a file lock so only one worker runs the scheduler."""
    global _lock_fd
    if scheduler.running:
        return
    try:
        _lock_fd = open("/tmp/karta_scheduler.lock", "w")
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (IOError, OSError):
        logger.info("Another worker owns the scheduler, skipping")
        return
    scheduler.start()
    logger.info("Scheduler started")
    asyncio.get_event_loop().create_task(_load_jobs())


def shutdown_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


async def _load_jobs():
    """Load all active reports and alerts from DB and schedule them."""
    def _fetch():
        from api.database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            reports = conn.execute(
                text("SELECT id, schedule, timezone FROM scheduled_reports WHERE is_active = TRUE")
            ).mappings().all()
            alerts = conn.execute(
                text("SELECT id, schedule, timezone FROM alert_rules WHERE is_active = TRUE")
            ).mappings().all()
        return [dict(r) for r in reports], [dict(a) for a in alerts]

    reports, alerts = await asyncio.to_thread(_fetch)
    for r in reports:
        add_report_job(r["id"], r["schedule"], r["timezone"])
    for a in alerts:
        add_alert_job(a["id"], a["schedule"], a["timezone"])
    logger.info(f"Loaded {len(reports)} report jobs, {len(alerts)} alert jobs")


def _parse_cron(expr: str, tz: str) -> CronTrigger:
    """Parse a 5-field cron expression into a CronTrigger."""
    parts = expr.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {expr}")
    minute, hour, day, month, dow = parts
    return CronTrigger(
        minute=minute, hour=hour, day=day, month=month,
        day_of_week=dow, timezone=tz,
    )


def add_report_job(report_id: int, cron_expr: str, timezone: str = "Europe/Moscow"):
    """Add or replace a scheduled report job."""
    job_id = f"report_{report_id}"
    scheduler.add_job(
        _run_report, trigger=_parse_cron(cron_expr, timezone),
        id=job_id, replace_existing=True, args=[report_id],
    )
    logger.info(f"Scheduled report job {job_id}: {cron_expr} ({timezone})")


def remove_report_job(report_id: int):
    job_id = f"report_{report_id}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass


def add_alert_job(alert_id: int, cron_expr: str, timezone: str = "Europe/Moscow"):
    """Add or replace an alert check job."""
    job_id = f"alert_{alert_id}"
    scheduler.add_job(
        _run_alert, trigger=_parse_cron(cron_expr, timezone),
        id=job_id, replace_existing=True, args=[alert_id],
    )
    logger.info(f"Scheduled alert job {job_id}: {cron_expr} ({timezone})")


def remove_alert_job(alert_id: int):
    job_id = f"alert_{alert_id}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass


async def _run_report(report_id: int):
    """Execute a scheduled report."""
    from api.reports.executor import execute_report
    try:
        await execute_report(report_id)
    except Exception as e:
        logger.error(f"Report {report_id} failed: {e}")


async def _run_alert(alert_id: int):
    """Execute an alert check."""
    from api.alerts.executor import execute_alert
    try:
        await execute_alert(alert_id)
    except Exception as e:
        logger.error(f"Alert {alert_id} failed: {e}")
