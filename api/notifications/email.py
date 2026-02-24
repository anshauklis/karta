import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"


async def send_message(recipients: str, text: str, subject: str = "Karta Notification") -> dict:
    """Send a text email. recipients is comma-separated email addresses."""
    host = SMTP_HOST
    if not host:
        raise ValueError("SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD env vars.")

    msg = MIMEText(text, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = recipients

    _send_smtp(msg, recipients.split(","))
    return {"sent_to": recipients}


async def send_file(recipients: str, file_bytes: bytes, filename: str,
                    caption: str = "", subject: str = "Karta Report") -> dict:
    """Send an email with file attachment."""
    host = SMTP_HOST
    if not host:
        raise ValueError("SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD env vars.")

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = recipients

    if caption:
        msg.attach(MIMEText(caption, "plain", "utf-8"))

    part = MIMEBase("application", "octet-stream")
    part.set_payload(file_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f"attachment; filename={filename}")
    msg.attach(part)

    _send_smtp(msg, recipients.split(","))
    return {"sent_to": recipients, "filename": filename}


def _send_smtp(msg: MIMEMultipart | MIMEText, recipients: list[str]):
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(msg["From"], [r.strip() for r in recipients], msg.as_string())
