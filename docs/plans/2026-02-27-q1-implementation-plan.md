# Q1 Implementation Plan (March–May 2026)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Karta as a publicly launched open-source BI platform with AI, embedding, PDF reports, and polished UX — ready for GitHub + Docker Hub + Product Hunt.

**Architecture:** Builds on existing Next.js 16 + FastAPI + DuckDB pipeline. New features layer onto existing patterns (TanStack Query hooks, shadcn/ui components, FastAPI routers).

**Tech Stack:** Next.js 16, FastAPI, PostgreSQL, DuckDB, Redis, Plotly.js, Monaco Editor, next-themes, next-auth, Playwright (for PDF screenshots)

---

## What's Already Done (skip these)

These were originally in Q1 scope but are already complete:

- ✅ DuckDB + Parquet pipeline (`api/parquet_cache.py`, `api/pipeline_sql.py`, `_execute_chart_full`)
- ✅ Text-to-SQL in SQL Lab (`useGenerateSQL()`, `useFixSQL()`, `/api/ai/generate-sql`)
- ✅ AI Chat with tools (20+ tools, SSE streaming, session management)
- ✅ Dark/light/system theme (`next-themes`, toggle in app header)
- ✅ Scheduled reports (cron → Excel → Slack/Telegram/Email)
- ✅ Shared dashboard links (`/shared/[token]`, JWT tokens, expiration)
- ✅ Data table component (TanStack Table v8, sorting, conditional formatting)
- ✅ Lazy chart rendering on dashboards (recent commit)

---

## Task 1: SQL Variables / Parameters

**Goal:** Add Jinja-like `{{ variable_name }}` syntax to SQL queries. Users define variables with defaults; dashboards can pass values at runtime.

**Files:**
- Create: `api/sql_params.py`
- Modify: `api/charts/router.py:1793-1955` (`execute_chart`, `preview_chart`)
- Modify: `api/models.py` (add `ChartVariable` model)
- Modify: `api/database.py` (add `chart_variables` JSON column to `charts` table)
- Modify: `frontend/src/types/index.ts` (add `ChartVariable` type)
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx` (variables UI)

### Step 1: Backend — variable parser (`api/sql_params.py`)

Create a module that extracts `{{ var_name }}` placeholders from SQL and substitutes them with provided values.

```python
"""SQL parameter/variable substitution.

Supports Jinja-like {{ variable_name }} syntax with safe substitution.
Variables are replaced with parameterized placeholders before SQL execution.
"""
import re
from typing import Any

_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")

def extract_variables(sql: str) -> list[str]:
    """Return unique variable names found in SQL."""
    return list(dict.fromkeys(_VAR_RE.findall(sql)))

def substitute(sql: str, values: dict[str, Any], defaults: dict[str, Any] | None = None) -> tuple[str, dict]:
    """Replace {{ var }} with $var DuckDB placeholders. Returns (sql, params)."""
    defaults = defaults or {}
    params = {}
    def _replace(m):
        name = m.group(1)
        val = values.get(name, defaults.get(name))
        if val is None:
            raise ValueError(f"Variable '{name}' has no value and no default")
        params[f"_var_{name}"] = val
        return f"$_var_{name}"
    result = _VAR_RE.sub(_replace, sql)
    return result, params
```

### Step 2: Schema — add variables to charts

In `api/database.py`, add to `SCHEMA_SQL`:
```sql
ALTER TABLE charts ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]';
```

Variables stored as: `[{"name": "date_start", "type": "date", "default": "2024-01-01", "label": "Start Date"}, ...]`

### Step 3: Integrate into chart execution

In `api/charts/router.py`, in `execute_chart` and `preview_chart`, after `_resolve_chart_sql`:

```python
from api.sql_params import extract_variables, substitute

# Substitute variables in SQL
chart_vars = chart.get("variables") or []
var_defaults = {v["name"]: v.get("default") for v in chart_vars}
runtime_values = (req.variable_values if req else None) or {}
if extract_variables(sql_query):
    sql_query, var_params = substitute(sql_query, runtime_values, var_defaults)
    # var_params are passed to DuckDB in _execute_chart_full
```

Add `variable_values: dict | None = None` to `ChartExecuteRequest` model.

### Step 4: Frontend — variables editor in data-tab

Add a "Variables" section below the SQL editor in the chart editor. Shows detected variables with fields for: name (auto-detected), type (text/number/date), default value, label.

Use pattern from existing metrics editor: list of rows with inputs + delete button.

### Step 5: Commit

```bash
git add api/sql_params.py api/charts/router.py api/models.py api/database.py
git add frontend/src/types/index.ts frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx
git commit -m "feat: add SQL variables/parameters with {{ var_name }} syntax"
```

---

## Task 2: AI Chart Builder Enhancement

**Goal:** User describes a chart in natural language → AI produces a complete chart config (chart_type, x_column, y_columns, metrics, colors, title) → renders immediately in the editor.

**Current state:** `quick_create_chart` tool in `api/ai/tools.py` exists but creates a minimal chart. Need to make it produce full visual configs.

**Files:**
- Modify: `api/ai/tools.py` (enhance `quick_create_chart` tool schema)
- Modify: `api/ai/prompts.py` (add chart builder system prompt with config schema)
- Create: `frontend/src/components/ai/ai-chart-builder.tsx` (standalone AI chart builder UI)
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx` (integrate builder)

### Step 1: Enhance AI tool schema

In `api/ai/tools.py`, update `quick_create_chart` to accept the full `chart_config` object:

```python
{
    "name": "quick_create_chart",
    "parameters": {
        "type": "object",
        "properties": {
            "connection_id": {"type": "integer"},
            "sql_query": {"type": "string", "description": "SQL to fetch data"},
            "title": {"type": "string"},
            "chart_type": {"type": "string", "enum": ["bar", "line", "area", "pie", "scatter", ...]},
            "chart_config": {
                "type": "object",
                "properties": {
                    "x_column": {"type": "string"},
                    "y_columns": {"type": "array", "items": {"type": "string"}},
                    "color_column": {"type": "string"},
                    "metrics": {"type": "array"},
                    "show_legend": {"type": "boolean"},
                    "orientation": {"type": "string", "enum": ["v", "h"]},
                }
            }
        }
    }
}
```

### Step 2: Add chart builder prompt

In `api/ai/prompts.py`, add a builder-specific system prompt that includes:
- Available chart types with descriptions
- Config field schema per chart type (from `get_capabilities()`)
- Example configs for common patterns
- Instructions to always return SQL + full config

### Step 3: Frontend — AI chart builder component

Create `ai-chart-builder.tsx`: a prompt input in the chart editor header area. User types description → AI returns SQL + config → auto-populates chart editor fields + runs preview.

Wire to existing `useAIChat()` hook with a `context: "chart_builder"` flag that triggers the builder prompt on the backend.

### Step 4: Commit

```bash
git add api/ai/tools.py api/ai/prompts.py
git add frontend/src/components/ai/ai-chart-builder.tsx
git add frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx
git commit -m "feat: AI chart builder — describe a chart, get it instantly"
```

---

## Task 3: Dashboard Iframe Embed

**Goal:** Generate embeddable `<iframe>` code for dashboards. Embed route has no chrome (no header, no nav), supports theme and filter params.

**Files:**
- Create: `frontend/src/app/embed/[token]/page.tsx` (embed route — outside `(dashboard)` layout)
- Modify: `api/export/router.py` (add embed token generation with embed-specific options)
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx` (add "Embed" button to share dialog)
- Modify: `nginx.conf` (add `X-Frame-Options` exception for `/embed/*`)

### Step 1: Create embed page

`frontend/src/app/embed/[token]/page.tsx` — similar to `shared/[token]` but:
- No `AppShell` wrapper (no header, no sidebar, no auth)
- Reads `?theme=dark|light` from URL params
- Reads `?filter_col=val` from URL params → passes as runtime filters
- Minimal padding, full-width layout
- `<meta name="robots" content="noindex">` for SEO

### Step 2: Backend — embed token

In `api/export/router.py`, add `POST /api/dashboards/{id}/embed`:
- Creates a share link with `type: "embed"` (new column or flag)
- Returns embed token + HTML snippet: `<iframe src="..." width="100%" height="600"></iframe>`

### Step 3: Nginx — allow iframe

Add to `nginx.conf` in the embed location block:
```nginx
location /embed/ {
    proxy_pass http://frontend:3000;
    proxy_hide_header X-Frame-Options;
    add_header Content-Security-Policy "frame-ancestors *";
}
```

### Step 4: Frontend — embed dialog

In the dashboard page, extend the existing share dialog with an "Embed" tab showing:
- Generated iframe code (copyable)
- Preview of embed URL
- Options: theme, height, auto-refresh interval

### Step 5: Commit

```bash
git add frontend/src/app/embed/ api/export/router.py nginx.conf
git add frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx
git commit -m "feat: dashboard iframe embedding with theme and filter params"
```

---

## Task 4: PDF/PNG Report Export

**Goal:** Extend scheduled reports to send dashboard screenshots (PNG/PDF) in addition to Excel. Uses headless Chromium via Playwright.

**Files:**
- Create: `api/screenshot.py` (headless browser screenshot service)
- Modify: `api/reports/executor.py` (add PNG/PDF export path)
- Modify: `api/reports/router.py` (add `format` field: excel/png/pdf)
- Modify: `api/models.py` (update `ReportCreate` model)
- Modify: `api/database.py` (add `format` column to `scheduled_reports`)
- Modify: `api/Dockerfile` (install Playwright + Chromium)

### Step 1: Screenshot service

`api/screenshot.py`:
```python
"""Headless browser screenshots for dashboards/charts."""
import asyncio
from playwright.async_api import async_playwright

async def capture_dashboard(token: str, base_url: str, format: str = "png",
                            width: int = 1280, height: int = 900) -> bytes:
    """Capture shared dashboard as PNG or PDF."""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": width, "height": height})
        await page.goto(f"{base_url}/shared/{token}", wait_until="networkidle")
        await page.wait_for_timeout(2000)  # Wait for charts to render

        if format == "pdf":
            data = await page.pdf(width=f"{width}px", print_background=True)
        else:
            data = await page.screenshot(full_page=True, type="png")

        await browser.close()
        return data
```

### Step 2: Integrate into reports executor

In `api/reports/executor.py`, check report `format`:
- `"excel"` → existing Excel path
- `"png"` / `"pdf"` → create temporary share link → capture screenshot → send file → delete share link

### Step 3: Schema update

Add to `SCHEMA_SQL`: `ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS format VARCHAR(10) DEFAULT 'excel';`

### Step 4: Dockerfile

Add Playwright install to `api/Dockerfile`:
```dockerfile
RUN pip install playwright && playwright install chromium --with-deps
```

### Step 5: Commit

```bash
git add api/screenshot.py api/reports/executor.py api/reports/router.py
git add api/models.py api/database.py api/Dockerfile
git commit -m "feat: PDF/PNG report export via headless Chromium"
```

---

## Task 5: Natural Language Dashboard Filters

**Goal:** Add an AI-powered filter bar to dashboards. User types "show last 30 days for USA" → AI parses → applies filters to dashboard charts.

**Files:**
- Create: `api/ai/filter_parser.py` (NL → filter config)
- Modify: `api/ai/router.py` (add `/api/ai/parse-filters` endpoint)
- Create: `frontend/src/components/dashboard/nl-filter-bar.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx` (integrate bar)
- Modify: `frontend/src/hooks/use-ai.ts` (add `useParseFilters()` hook)

### Step 1: Backend — filter parser

`api/ai/filter_parser.py`:

Uses LLM to parse natural language into structured filter objects. Sends column names + types as context so the LLM knows what's filterable.

```python
async def parse_filters(prompt: str, available_columns: list[dict],
                        connection_id: int) -> list[dict]:
    """Parse natural language into dashboard filter objects.

    Returns: [{"column": "date", "operator": ">=", "value": "2024-01-01"}, ...]
    """
    # Build system prompt with available columns and their types
    # Call LLM with function calling to return structured filters
    # Validate column names exist in available_columns
```

### Step 2: API endpoint

`POST /api/ai/parse-filters`:
- Input: `{ prompt, dashboard_id, connection_id }`
- Fetches dashboard's charts → collects all available columns
- Calls `parse_filters()` with column context
- Returns: `{ filters: [{ column, operator, value }] }`

### Step 3: Frontend — NL filter bar

`nl-filter-bar.tsx`: Input field at top of dashboard with AI sparkle icon. On submit:
1. Call `parseFilters` mutation
2. Apply returned filters to dashboard filter state
3. All charts re-execute with new filters

### Step 4: Commit

```bash
git add api/ai/filter_parser.py api/ai/router.py
git add frontend/src/components/dashboard/nl-filter-bar.tsx
git add frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx
git add frontend/src/hooks/use-ai.ts
git commit -m "feat: natural language dashboard filters via AI"
```

---

## Task 6: AI Auto-Insights

**Goal:** Automatic anomaly detection and trend analysis on chart data. Shows insight badges on charts ("↑ 23% vs last month", "Anomaly detected in Q3").

**Files:**
- Create: `api/ai/insights.py` (statistical analysis + LLM summarization)
- Modify: `api/charts/router.py` (add `/api/charts/{id}/insights` endpoint)
- Create: `frontend/src/components/charts/chart-insights.tsx`
- Modify: `frontend/src/components/charts/chart-card.tsx` (show insights badge)
- Modify: `frontend/src/hooks/use-charts.ts` (add `useChartInsights()` hook)

### Step 1: Statistical analysis module

`api/ai/insights.py`:

```python
"""Automated chart data insights — statistical analysis + LLM summarization."""
import pandas as pd
import numpy as np

def detect_insights(df: pd.DataFrame, chart_config: dict) -> list[dict]:
    """Analyze chart data and return insights.

    Returns: [{"type": "trend", "severity": "info", "message": "Revenue up 23% MoM"}, ...]
    """
    insights = []
    # 1. Trend detection: compare last period vs previous
    # 2. Anomaly detection: Z-score > 2 on any metric
    # 3. Percentage change: significant changes in latest data point
    # 4. Missing data: gaps in time series
    return insights

async def summarize_insights(insights: list[dict], chart_title: str) -> str:
    """Use LLM to generate human-readable summary from statistical insights."""
    # Optional: call LLM for natural language summary
    # Falls back to template-based messages if AI disabled
```

### Step 2: API endpoint

`GET /api/charts/{chart_id}/insights`:
- Executes chart (or uses cached result)
- Runs `detect_insights()` on DataFrame
- Optionally summarizes via LLM
- Returns list of insight objects

### Step 3: Frontend — insight badges

`chart-insights.tsx`: Small badge on chart cards showing top insight. Click expands to full list. Color-coded: green (positive trend), red (negative), blue (info), yellow (anomaly).

### Step 4: Commit

```bash
git add api/ai/insights.py api/charts/router.py
git add frontend/src/components/charts/chart-insights.tsx
git add frontend/src/components/charts/chart-card.tsx
git add frontend/src/hooks/use-charts.ts
git commit -m "feat: AI auto-insights — anomaly detection and trend analysis"
```

---

## Task 7: Responsive Mobile Dashboard View

**Goal:** Dashboards readable on mobile (< 768px). Single-column stack, no drag/resize, swipe between charts, touch-friendly filters.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx`
- Create: `frontend/src/components/dashboard/mobile-dashboard.tsx`
- Modify: `frontend/src/components/charts/chart-card.tsx` (responsive sizing)
- Modify: `frontend/src/app/globals.css` (mobile breakpoints)

### Step 1: Mobile layout component

`mobile-dashboard.tsx`: When viewport < 768px, replace react-grid-layout with a simple vertical stack. Charts render full-width, sorted by grid position (top-to-bottom, left-to-right).

```tsx
// Sort charts by grid position for mobile
const sorted = [...charts].sort((a, b) =>
  a.grid_y !== b.grid_y ? a.grid_y - b.grid_y : a.grid_x - b.grid_x
);

return (
  <div className="flex flex-col gap-4 p-4">
    {sorted.map(chart => (
      <ChartCard key={chart.id} chart={chart} className="w-full" />
    ))}
  </div>
);
```

### Step 2: Responsive chart card

In `chart-card.tsx`, add responsive height: min-height 200px on mobile (instead of grid-defined height). Charts auto-resize via Plotly's `responsive: true`.

### Step 3: Dashboard page — detect mobile

In dashboard page, use `useMediaQuery` or CSS-only approach to switch between grid layout and mobile stack.

### Step 4: Commit

```bash
git add frontend/src/components/dashboard/mobile-dashboard.tsx
git add frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx
git add frontend/src/components/charts/chart-card.tsx
git commit -m "feat: responsive mobile dashboard view — single-column stack"
```

---

## Task 8: Error Handling & Polish Sweep

**Goal:** Audit all chart types for edge cases, improve error messages, add graceful fallbacks.

**Files:**
- Modify: `api/charts/router.py` (`_classify_error` enhancement)
- Modify: `api/executor.py` (renderer error handling)
- Modify: `frontend/src/components/charts/chart-card.tsx` (error display)
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx` (error boundaries)

### Step 1: Backend — improve error classification

In `_classify_error()`, add specific error codes and user-friendly messages for:
- Connection timeout → `"CONNECTION_TIMEOUT"` + "Database is not responding"
- SQL syntax error → `"SQL_SYNTAX"` + extract relevant line
- Column not found → `"COLUMN_NOT_FOUND"` + suggest similar names
- Permission denied → `"PERMISSION_DENIED"` + "Ask admin for access"
- OOM → `"OUT_OF_MEMORY"` + "Query returns too many rows. Add filters."

### Step 2: Frontend — error display

In `chart-card.tsx`, show structured error cards with:
- Error icon + code
- User-friendly message (not raw traceback)
- "Fix with AI" button (calls `useFixSQL()`)
- "Retry" button

### Step 3: Renderer edge cases

Test each renderer with: empty DataFrame, single row, null values, very long strings, Unicode, numeric overflow. Fix any crashes. Add `try/except` in `build_visual_chart` per renderer with fallback to raw data table.

### Step 4: Commit

```bash
git add api/charts/router.py api/executor.py
git add frontend/src/components/charts/chart-card.tsx
git commit -m "fix: improve error handling across all chart types"
```

---

## Task 9: CI/CD — Docker Hub + GitHub Actions

**Goal:** Automated Docker image builds on push to main. Published to Docker Hub (or GitHub Container Registry).

**Files:**
- Create: `.github/workflows/docker.yml`
- Create: `.github/workflows/lint.yml`
- Modify: `api/Dockerfile` (multi-stage build, version label)
- Modify: `frontend/Dockerfile` (multi-stage build, version label)
- Create: `docker-compose.prod.yml` (production compose with published images)

### Step 1: Docker workflow

`.github/workflows/docker.yml`:
```yaml
name: Build & Push Docker Images
on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  API_IMAGE: ghcr.io/${{ github.repository }}/api
  FRONTEND_IMAGE: ghcr.io/${{ github.repository }}/frontend

jobs:
  build-api:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./api
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ${{ env.API_IMAGE }}:latest
            ${{ env.API_IMAGE }}:${{ github.sha }}

  build-frontend:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ${{ env.FRONTEND_IMAGE }}:latest
            ${{ env.FRONTEND_IMAGE }}:${{ github.sha }}
```

### Step 2: Lint workflow

`.github/workflows/lint.yml` — runs `ruff check` for Python and `npm run lint` for TypeScript on PRs.

### Step 3: Production compose

`docker-compose.prod.yml` — uses published images instead of local builds. Users download this + `.env.example` and run.

### Step 4: Commit

```bash
git add .github/workflows/ docker-compose.prod.yml
git commit -m "ci: add Docker build/push and lint workflows"
```

---

## Task 10: Public Launch Prep

**Goal:** Everything needed for a credible open-source launch: LICENSE, README with screenshots, contributing guide, docker-compose quickstart.

**Files:**
- Create: `LICENSE` (AGPL-3.0)
- Rewrite: `README.md` (project overview, screenshots, quickstart, features)
- Create: `CONTRIBUTING.md` (how to contribute, code style, PR process)
- Create: `.env.example` (example environment variables)
- Create: `docs/quickstart.md` (5-minute setup guide)

### Step 1: LICENSE

AGPL-3.0 full text. Standard file.

### Step 2: README.md

Structure:
1. Logo + one-liner tagline
2. Screenshot gallery (3-4 key screens: dashboard, chart editor, SQL Lab, AI chat)
3. Features list (with check marks)
4. Quick Start (docker compose up)
5. Comparison table (vs Superset, Metabase)
6. Tech stack badges
7. Contributing link
8. License

### Step 3: CONTRIBUTING.md

- Development setup (clone, docker compose up)
- Code style (Python: ruff, TypeScript: ESLint)
- PR process (branch from main, descriptive commits)
- Architecture overview link

### Step 4: .env.example

```env
POSTGRES_PASSWORD=changeme
JWT_SECRET=changeme-generate-random-64-chars
CONNECTION_SECRET=changeme-generate-random-32-chars
PORT=80
NEXTAUTH_URL=http://localhost

# Optional: AI features
AI_ENABLED=true
AI_API_URL=https://api.openai.com/v1
AI_API_KEY=sk-your-key-here
AI_MODEL=gpt-4o
```

### Step 5: Commit

```bash
git add LICENSE README.md CONTRIBUTING.md .env.example docs/quickstart.md
git commit -m "docs: add LICENSE (AGPL-3.0), README, contributing guide, quickstart"
```

---

## Implementation Order

Tasks are ordered by dependency and impact:

| # | Task | Effort | Dependencies | Impact |
|---|------|--------|-------------|--------|
| 1 | SQL Variables/Parameters | 2-3 days | None | High — unlocks reusable charts |
| 2 | AI Chart Builder | 2-3 days | None | Very High — wow factor |
| 3 | Dashboard Iframe Embed | 2-3 days | None | High — enterprise must-have |
| 4 | PDF/PNG Report Export | 2-3 days | None | Medium — completes reports |
| 5 | NL Dashboard Filters | 2-3 days | None | High — differentiator |
| 6 | AI Auto-Insights | 3-4 days | None | Medium — differentiator |
| 7 | Responsive Mobile | 1-2 days | None | Medium — polish |
| 8 | Error Handling Sweep | 2-3 days | None | High — stability |
| 9 | CI/CD | 1 day | None | High — launch blocker |
| 10 | Launch Prep | 1-2 days | Tasks 1-9 | Critical — launch blocker |

**Total estimate: ~20-25 working days** (1 month for fulltime solo+AI dev).

Tasks 1-8 can be done in any order (no dependencies between them). Tasks 9-10 should be last.

---

## Verification

After all tasks complete:

1. `docker compose up --build -d` — all services start clean
2. Create chart with `{{ date_start }}` variable → variable UI appears, substitution works
3. Ask AI to "create a bar chart of revenue by month" → full chart renders
4. Generate embed code for dashboard → iframe renders without chrome
5. Schedule PDF report → receive email with dashboard screenshot
6. Type "show last 30 days" in dashboard filter bar → filters apply
7. Chart card shows "↑ 12% MoM" insight badge
8. Open dashboard on mobile → single-column readable layout
9. Trigger intentional SQL error → friendly error message + "Fix with AI" button
10. `git push` → GitHub Actions builds and pushes Docker images
11. New user can `docker compose -f docker-compose.prod.yml up` with published images
