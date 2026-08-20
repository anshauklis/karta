# ---------- builder: compiles/downloads dependencies, never shipped ----------
FROM python:3.13-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Toolchain lives here only. Every wheel we depend on ships binaries, but a
# source-only dependency must still be able to build without breaking prod.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---------- runtime ----------
FROM python:3.13-slim

# Create the unprivileged user BEFORE anything lands in /app, so every COPY
# below can set ownership inline. A trailing `chown -R app:app /app` instead
# makes overlayfs copy up the entire venv into a duplicate ~770MB layer, and
# rebuilds it on every code change.
RUN useradd -m -u 1000 app

WORKDIR /app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH

# Playwright resolves browsers relative to the *current* user's HOME. Installing
# as root without this put them in /root/.cache (mode 0700), unreachable for the
# `app` user the container actually runs as — screenshots failed and the 622MB
# download was dead weight. A fixed path is user-independent.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN install -d -m 0755 /ms-playwright \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Code last: it changes on every build and this layer is ~2MB, so a code change
# no longer invalidates any of the expensive layers above.
COPY --chown=app:app . ./api/

# /app makes `api.main` importable, /app/api makes sibling modules importable
# by bare name. Set explicitly so entrypoints work regardless of launcher.
ENV PYTHONPATH=/app:/app/api

USER app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
