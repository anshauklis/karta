# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Karta is a self-hosted BI platform (like Apache Superset). **Frontend** — Next.js 16 app in `frontend/`. **Backend** — FastAPI app in `api/`. Both run in Docker via `docker-compose.yml`. License: AGPL-3.0.

## Commands

```bash
# Full stack (ALWAYS use full rebuild — partial restart doesn't pick up changes)
docker compose up --build -d        # Build and start all services
docker compose logs -f api          # Tail API logs
docker compose logs -f frontend     # Tail frontend logs

# Frontend development (from frontend/)
cd frontend && npm run dev          # Start dev server on :3001 (see .env.local)
npm run build                       # Production build (standalone output for Docker)
npm run lint                        # ESLint

# API linting
cd api && uv run ruff check .       # Ruff linter

# API tests (from api/)
cd api && uv run pytest tests/ -v                              # All unit tests
cd api && uv run pytest tests/ -v --ignore=tests/integration   # Unit only (no DB needed)
cd api && uv run pytest tests/test_sql_validator.py -v         # Single module

# Frontend tests (from frontend/)
cd frontend && npm test                                        # All tests (single run)
cd frontend && npm run test:watch                              # Watch mode
```

**After any code change: commit, then `docker compose up --build -d`.** Partial restarts (`restart api`) do NOT apply changes.

## Architecture

### Request Flow

```
Browser → nginx(:80) → /api/*       → FastAPI(:8000)
                      → /api/auth/*  → Next.js(:3000)  (NextAuth session endpoints)
                      → /embed/*     → Next.js(:3000)  (public embeds, no X-Frame-Options)
                      → /*           → Next.js(:3000)
```

nginx splits `/api/auth/(session|csrf|callback|signin|signout|providers|error)` to Next.js (NextAuth), all other `/api/*` to FastAPI. Embed routes (`/embed/`) have `frame-ancestors *` CSP for iframe embedding. Config: `nginx.conf`.

### Frontend Stack

- **Next.js 16** App Router with `output: "standalone"` for Docker
- **React 19** with `use()` hook for params
- **shadcn/ui** (New York style) + Tailwind CSS 4 + OKLch colors
- **TanStack Query 5** for all server state (hooks in `frontend/src/hooks/`)
- **Zustand 5** for client-only state
- **Plotly.js + Recharts** for chart rendering
- **Monaco Editor** for SQL and Python code editing
- **next-intl** for i18n (en/ru), locale stored in cookie
- **next-auth** for JWT session management
- **react-grid-layout** for dashboard grid, **@dnd-kit** for drag-and-drop, **react-resizable-panels** for editor panels

### Path Alias

`@/` resolves to `frontend/src/`. Example: `import { api } from "@/lib/api"`.

### API Client Pattern

All API calls go through `frontend/src/lib/api.ts` — wraps `fetch` with auth token injection, JSON handling, and error toasts. Every hook in `frontend/src/hooks/` uses TanStack Query:

```typescript
export function useDashboards() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useQuery({
    queryKey: ["dashboards"],
    queryFn: () => api.get<Dashboard[]>("/api/dashboards", token),
    enabled: !!token,
  });
}
```

Mutations use `useMutation` and invalidate relevant query keys on success.

### Route Structure

- `(auth)/` — login, initial setup wizard (no shell)
- `(dashboard)/` — all protected routes wrapped in `AppShell` (header + auth guard)
  - `dashboard/[slug]/` — view/edit dashboard
  - `dashboard/[slug]/chart/[id]/` — chart editor (3-column: data panel, canvas, config)
  - `charts/`, `charts/new`, `charts/[id]` — standalone chart management
  - `connections/`, `datasets/`, `sql-lab/`, `alerts/`, `reports/`, `stories/`
  - `admin/users`, `admin/rls` — admin-only routes
  - `shared/[token]` — public shared dashboard (no auth, read-only)
- `embed/[token]/` — public embeddable dashboard (no auth, no chrome, iframe-friendly)

### Chart Editor

The chart editor (`dashboard/[slug]/chart/[id]/`) is the most complex page. Key files:
- `hooks/use-chart-editor.ts` — main orchestration hook (state, save, undo/redo, draft auto-save, variables)
- `components/chart-header.tsx` — title, connection/dataset selectors, save/run buttons, AI chart builder
- `components/chart-sidebar.tsx` — column browser with DnD, visual config fields
- `components/chart-canvas.tsx` — Plotly/Recharts rendering area
- `components/sql-editor-panel.tsx` — Monaco SQL editor with schema autocomplete
- `components/data-tab.tsx` — data panel with SQL variables editor (auto-detects `{{ var }}` from SQL)

Charts have two modes: `visual` (configured via UI dropdowns) and `code` (Python/Plotly executed server-side).

**Visual↔Code roundtrip**: `frontend/src/lib/generate-code.ts` converts visual config → Python code. `frontend/src/lib/parse-code.ts` parses Python code → visual config. Both must stay in sync when adding new chart config fields.

**Draft system**: Chart editor auto-saves drafts to server (`api/drafts/`). On page load, drafts are auto-restored. Drafts deleted on successful save. Hook: `frontend/src/hooks/use-chart-drafts.ts`.

**SQL Variables**: Charts support `{{ variable_name }}` syntax. Variables stored as JSONB array in `charts.variables` column. Backend `api/sql_params.py` handles extraction (`extract_variables`) and type-safe substitution (`substitute`) — embeds literal values (not parameterized placeholders) to work across all DB engines.

### Dashboard Features

- **Grid layout**: `react-grid-layout` on desktop, `MobileDashboard` vertical stack on mobile (< 768px)
- **Error isolation**: Each chart wrapped in `ChartErrorBoundary` — one crash doesn't affect others
- **NL Filter Bar**: AI-powered natural language filter input (`nl-filter-bar.tsx`), calls `POST /api/ai/parse-filters`
- **Chart Insights**: Statistical badges on chart cards (`chart-insights-badge.tsx`) — trend/anomaly detection via `api/ai/insights.py`
- **Embed**: `/embed/[token]` route with `?theme=dark|light` and `?filter_<col>=<val>` URL params
- **Drill filters**: Cross-chart filtering via URL params and filter panel

### Backend (api/)

FastAPI with raw SQL (SQLAlchemy `text()` queries, no ORM). Python 3.13, managed with `uv`. Key modules:
- `database.py` — PostgreSQL engine, schema DDL, `ensure_schema()` auto-migration on startup
- `models.py` — ~70 Pydantic request/response models
- `executor.py` — chart rendering engine (21+ chart types, statistical overlays, pivots)
- `sql_validator.py` — whitelist-based SQL validation (SELECT/WITH only)
- `sql_params.py` — `{{ variable }}` extraction and type-safe substitution
- `screenshot.py` — Playwright headless Chromium for PDF/PNG dashboard screenshots
- `connections/router.py` — manages external DB connections (Postgres, MySQL, MSSQL, ClickHouse, DuckDB)
- `csv_upload/router.py` — CSV/Parquet upload → DuckDB table → dataset
- `charts/router.py` — CRUD + execute/preview with data pipeline (time grain, filters, metrics, calculated columns, variables)
- `reports/executor.py` — scheduled reports: Excel, PNG, PDF via screenshot service
- `ai/router.py` — AI endpoints: chat (SSE), generate-sql, fix-sql, suggest-chart-config, parse-filters, summarize, glossary
- `ai/insights.py` — pure statistical analysis (no LLM): period trends, Z-score anomalies, linear regression
- `ai/prompts.py` — system prompt builder with glossary, connection context, tool schemas

**DuckDB pattern**: File uploads stored as tables in `data/csv/uploads.duckdb`. System connection auto-created on startup. SQLAlchemy access uses `NullPool` + `read_only`. Native `duckdb.connect()` for writes and schema introspection.

**DuckDB + Parquet pipeline**: External DB queries cached as Parquet files (`api/parquet_cache.py`). Heavy transformations (pivots, calculated columns, time grains) run as DuckDB CTE chains on the cached Parquet — handles 40M+ rows without OOM. Pipeline in `api/pipeline_sql.py`, orchestrated by `_execute_chart_full()` in `charts/router.py`.

**Database connections encrypt passwords** with AES-256-GCM (`api/crypto.py`). Stored in `password_encrypted` column, never plaintext.

**Schema changes**: Add columns/tables to `SCHEMA_SQL` in `api/database.py`. Uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` — no migration framework.

**Pivot tables**: `executor.py:build_pivot_table()` handles MultiIndex columns, subtotals, sorting, column limits, value labels. For code mode, `_serialize_pivot_from_code()` extracts `pivot_header_levels` and `pivot_row_index_count` from MultiIndex before flattening. Both `charts/router.py` execute and preview endpoints must pass these fields through to `ChartExecuteResponse`.

**Error classification**: `charts/router.py:_classify_error()` maps exceptions to structured `{code, message, detail}` dicts with 12 error codes (CONNECTION_TIMEOUT, SQL_SYNTAX, COLUMN_NOT_FOUND, PERMISSION_DENIED, OUT_OF_MEMORY, DIVISION_BY_ZERO, TYPE_MISMATCH, CONNECTION_REFUSED, etc.). Frontend shows user-friendly messages, not raw tracebacks.

**AI architecture**: BYO API key (OpenAI, Anthropic, Ollama). Env vars: `AI_ENABLED`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`. Returns 503 if not configured. Chat endpoint uses SSE streaming with tool-use loop (max 5 iterations). Function calling for structured outputs (chart config, filters).

### Docker Setup

| Service | Image | Port | Memory |
|---------|-------|------|--------|
| postgres | postgres:16-alpine | 5432 | 1GB |
| api | ./api (Python 3.13, uv) | 8000 | 4GB |
| frontend | ./frontend (Node 25) | 3000 | 768MB |
| nginx | nginx:alpine | 80 | 256MB |
| redis | redis:7-alpine | 6379 | 256MB |
| mcp | ./mcp (optional profile) | 8811 | 256MB |

API volume mount: `./data/csv:/app/data/csv` (for DuckDB + uploaded files).

### Environment Variables

Root `.env` (used by docker-compose): `POSTGRES_PASSWORD`, `JWT_SECRET`, `CONNECTION_SECRET`, `REDIS_PASSWORD`, `PORT`, `NEXTAUTH_URL`.

Optional AI: `AI_ENABLED`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`.

Optional SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS`.

Optional: `CORS_ORIGINS`, `DISABLE_DOCS`, `DOMAIN` (for SSL mode).

Frontend `frontend/.env.local` (local dev): `NEXT_PUBLIC_API_URL=http://localhost:8001`, `NEXTAUTH_URL=http://localhost:3001`.

In Docker, `NEXT_PUBLIC_API_URL` is empty (relative URLs via nginx).

### CI/CD

- `.github/workflows/docker.yml` — builds and pushes api + frontend images to GHCR on push to main/tags
- `.github/workflows/lint.yml` — runs `ruff check` (Python) and `npm run lint` (TypeScript) on PRs
- `docker-compose.ghcr.yml` — production compose using pre-built GHCR images

## Key Conventions

- **Language**: User communicates in Russian, code and comments in English.
- **No ORM**: Backend uses raw SQL with parameterized queries via SQLAlchemy `text()`. No models mapped to tables.
- **Package manager**: API uses `uv` (pyproject.toml + uv.lock). Frontend uses `npm` (package.json + package-lock.json).
- **System connections**: Connections with `is_system=true` cannot be edited or deleted. DuckDB connection is auto-created as system.
- **charts.dashboard_id is nullable**: Charts can exist without a dashboard (standalone charts).
- **API auth**: All endpoints require `Bearer <JWT>` token via `Depends(get_current_user)`. Admin routes add `Depends(require_admin)`.
- **Frontend i18n**: Use `useTranslations()` from next-intl. Translations in `frontend/messages/en.json` and `frontend/messages/ru.json`. Always add keys to both files.
- **Component library**: Use existing shadcn/ui components from `frontend/src/components/ui/`. Add new ones with `npx shadcn add <component>`.
- **Mobile responsive**: Use `useIsMobile()` hook (breakpoint 768px) for mobile-specific rendering. Dashboard pages switch between `ReactGridLayout` and `MobileDashboard`.
- **Error boundaries**: Wrap chart rendering in `ChartErrorBoundary` to isolate crashes.
- **SQL variables**: `{{ variable_name }}` syntax substituted with literal values via `api/sql_params.py`. Works across all DB engines.
- **NEVER change user passwords or logins in the database** — not even for testing.
- **Charts must ALWAYS show complete data** — never add row limits to chart SQL execution.
