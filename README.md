<p align="center">
  <img src="https://raw.githubusercontent.com/anshauklis/karta/main/frontend/public/logo.svg" alt="Karta" width="64" height="64" />
</p>

<h1 align="center">Karta</h1>

<p align="center">
  Open-source, self-hosted BI platform.<br/>
  Connect databases, write SQL, build dashboards — no vendor lock-in.
</p>

<p align="center">
  <a href="https://github.com/anshauklis/karta/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/python-3.11-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js" />
</p>

---

## Features

### Dashboards & Charts

- **Interactive Dashboards** — drag-and-drop grid layout, auto-execute on load, cross-chart filtering and drill-down
- **21 Chart Types** — bar, horizontal bar, line, area, pie, donut, scatter, histogram, heatmap, box plot, treemap, funnel, waterfall, combo, KPI card, correlation matrix, violin, pareto, control chart (SPC), pivot table, data table
- **Visual Chart Builder** — point-and-click configuration: axes, colors, legends, labels, sorting, 6 color palettes
- **Code Charts** — write Python with pandas, Plotly, NumPy for full control in a sandboxed environment
- **Chart Templates** — save and reuse chart configurations across dashboards

### AI Features (BYO API Key)

- **Text-to-SQL** — describe what you want in plain language, get SQL
- **AI Chart Builder** — describe a visualization, AI generates chart config + SQL
- **Natural Language Filters** — type "show last 30 days for USA" on any dashboard
- **AI Auto-Insights** — automatic trend detection, anomaly alerts, MoM changes on chart cards
- **AI SQL Fix** — automatic error diagnosis and fix suggestions
- **BYO Key** — works with OpenAI, Anthropic, or local Ollama. Zero server cost.

### Data & Analytics

- **SQL Lab** — Monaco editor with syntax highlighting, schema browser, autocomplete, CSV export
- **SQL Variables** — `{{ variable_name }}` syntax with type-safe substitution across all database engines
- **Statistical Overlays** — trendlines (linear, polynomial, exponential), moving averages, EMA, confidence bands, anomaly detection
- **Data Transforms** — moving average, year-over-year, cumulative sum, z-score normalization, forecasting (Holt-Winters)
- **DuckDB + Parquet Pipeline** — query 40M+ rows without OOM via automatic Parquet caching
- **Pivot Tables** — cross-tabulation with subtotals, custom SQL expressions, percentage modes
- **Column Formatting** — number, percent, currency, date formats with custom decimals, prefix/suffix, thousands separator
- **Conditional Formatting** — threshold rules and color scales for table/pivot cells
- **Datasets** — save and reuse SQL queries as named datasets

### Database Connectors

| Database | Driver | Status |
|----------|--------|--------|
| PostgreSQL | psycopg2 | Supported |
| MySQL / MariaDB | pymysql | Supported |
| Microsoft SQL Server | pymssql | Supported |
| ClickHouse | clickhouse-sqlalchemy | Supported |
| DuckDB | duckdb-engine | Supported |

All connection credentials are encrypted at rest with AES-256-GCM.

### Export

- **Excel** — formatted export with number formats, conditional formatting colors, auto-width columns, bold headers (via exceljs)
- **CSV** — with column formatting applied
- **PDF** — full dashboard export to PDF (A4 landscape, via html2canvas + jsPDF)
- **Shared Links** — public read-only dashboard links with optional expiration, fully rendered charts
- **Dashboard Embed** — iframe embedding with JWT tokens, theme support, URL-based filters
- **PDF/PNG Reports** — scheduled dashboard screenshots via Playwright, delivered by email/Slack/Telegram

### Collaboration

- **Dashboard Comments** — threaded comments at dashboard and chart level
- **Annotations** — add notes and context to individual charts
- **Stories** — narrative mode: combine charts, text, and annotations into a presentation
- **Change History** — track who changed what and when for every chart and dashboard
- **Bookmarks** — save quick links to frequently used dashboards and charts
- **Favorites** — star dashboards for quick sidebar access

### Security & Access Control

- **JWT Authentication** — secure token-based auth with cookie fallback
- **Role-Based Access** — admin and user roles with invite-based onboarding
- **Row-Level Security (RLS)** — filter data per user/role at query time
- **SQL Validation** — whitelist/blacklist query validation to prevent destructive operations
- **Python Sandbox** — restricted execution environment for code charts
- **Encrypted Credentials** — AES-256-GCM for all stored database passwords

### User Experience

- **Dark Mode** — system/light/dark themes with full Plotly chart support
- **Command Palette** — `Cmd+K` to search dashboards, pages, and navigate anywhere
- **Keyboard Shortcuts** — `Cmd+S` save, `Cmd+Shift+S` save & close, `Cmd+Enter` preview, `Cmd+Z` undo, `Cmd+Shift+Z` redo
- **Undo/Redo** — full undo/redo history for chart configuration changes
- **Auto-Save Drafts** — chart editor saves drafts to localStorage every 30 seconds with recovery banner
- **Fullscreen Charts** — expand any chart to a fullscreen dialog
- **Sortable Tables** — click column headers to sort, sticky headers during scroll
- **Duplicate Charts** — one-click chart duplication with all configuration
- **Welcome Wizard** — guided 3-step onboarding for new users
- **Responsive Mobile View** — single-column dashboard layout on mobile devices

### Infrastructure

- **Optional Redis Cache** — query result caching with 5-minute TTL, graceful fallback
- **Alerts & Reports** — scheduled alerts on metric thresholds, report generation
- **Data Lineage** — track data flow from connections through datasets to charts
- **Analytics** — usage tracking for dashboards and charts
- **Health Checks** — all services report health status for monitoring
- **MCP Server** — Model Context Protocol server for AI assistant integration

---

## Quick Start

```bash
git clone https://github.com/anshauklis/karta.git
cd karta
./install.sh
```

Open [http://localhost](http://localhost) and create your admin account on the setup screen.

The install script will:
- Check that Docker and Docker Compose are installed and running
- Auto-generate secure secrets (`JWT_SECRET`, `CONNECTION_SECRET`, `POSTGRES_PASSWORD`)
- Build and start all 5 services

---

## Architecture

```
nginx (:80/:443)
  ├── /api/auth/*  → frontend (:3000)  # NextAuth
  ├── /api/*       → api (:8000)       # FastAPI
  └── /*           → frontend (:3000)  # Next.js

redis (:6379)     → api (optional query cache)
postgres (:5432)  → api (internal metadata)
```

| Service    | Stack                | Purpose              | Memory Limit |
|------------|----------------------|----------------------|-------------|
| **postgres** | PostgreSQL 16 Alpine | Internal metadata DB | 1 GB |
| **api**      | Python 3.13, FastAPI | REST API backend     | 512 MB |
| **frontend** | Node 20, Next.js 16  | Web UI               | 512 MB |
| **nginx**    | nginx:alpine         | Reverse proxy + SSL  | 256 MB |
| **redis**    | Redis 7 Alpine       | Query result cache   | 256 MB |

All services have health checks, restart policies (`unless-stopped`), and JSON logging with rotation (10 MB, 3 files).

---

## Deployment

### HTTP (default)

Works out of the box — no domain or certificates needed:

```bash
./install.sh
```

Access via `http://<server-ip>` from any machine on the network.

### HTTPS with Let's Encrypt

For production with a domain and SSL:

```bash
DOMAIN=charts.example.com ./install.sh --ssl
```

Requirements:
- A DNS A record pointing to your server's IP
- Ports 80 and 443 open

Certificate renewal is handled automatically by a certbot container (checks every 12 hours).

### Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `POSTGRES_PASSWORD` | No | `karta` | Internal DB password |
| `JWT_SECRET` | Yes | Auto-generated | JWT signing key |
| `CONNECTION_SECRET` | Yes | Auto-generated | AES key for DB passwords |
| `PORT` | No | `80` | External HTTP port |
| `NEXTAUTH_URL` | No | `http://localhost` | Public URL for auth callbacks |
| `DOMAIN` | No | — | Domain name for SSL mode |
| `REDIS_URL` | No | `redis://redis:6379/0` | Redis connection URL |

All secrets are auto-generated by `install.sh`. Set them manually only if not using the install script.

### Backups

Dump the internal metadata database:

```bash
docker compose exec postgres pg_dump -U karta karta > backup_$(date +%Y%m%d).sql
```

Restore from backup:

```bash
docker compose exec -T postgres psql -U karta karta < backup.sql
```

Automate with cron (daily at 3 AM):

```bash
0 3 * * * cd /path/to/karta && docker compose exec -T postgres pg_dump -U karta karta | gzip > /backups/karta_$(date +\%Y\%m\%d).sql.gz
```

### Updating

```bash
cd karta
git pull
docker compose up -d --build
```

The API automatically runs database migrations on startup.

---

## Development

### API (FastAPI)

```bash
cd api
uv sync
DATABASE_URL="postgresql://karta:karta@localhost:5432/karta" \
JWT_SECRET="dev-secret" \
CONNECTION_SECRET="dev-conn-secret" \
  uvicorn api.main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs` (Swagger UI).

### Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

### Full Stack with Docker

```bash
docker compose up --build
```

---

## Chart Types

| Type | Key | Best For |
|------|-----|----------|
| Bar | `bar` | Comparing categories |
| Horizontal Bar | `bar_h` | Long category labels |
| Line | `line` | Trends over time |
| Area | `area` | Volume over time |
| Pie | `pie` | Part-of-whole (few categories) |
| Donut | `donut` | Part-of-whole with center label |
| Scatter | `scatter` | Correlations between variables |
| Histogram | `histogram` | Value distributions |
| Heatmap | `heatmap` | Two-dimensional patterns |
| Box Plot | `box` | Statistical distributions |
| Treemap | `treemap` | Hierarchical proportions |
| Funnel | `funnel` | Conversion pipelines |
| Waterfall | `waterfall` | Cumulative effect of values |
| Combo | `combo` | Mixed bar + line on dual axes |
| KPI Card | `kpi` | Single metric with target |
| Correlation Matrix | `correlation` | Variable relationships |
| Violin | `violin` | Distribution shape comparison |
| Pareto | `pareto` | 80/20 analysis |
| Control Chart (SPC) | `control` | Process control with UCL/LCL |
| Pivot Table | `pivot` | Cross-tabulation with aggregation |
| Data Table | `table` | Raw data with sorting and formatting |

All chart types support: color palettes (6 built-in), conditional formatting, Excel/CSV export, fullscreen mode, and chart duplication.

---

## Tech Stack

**Backend:** FastAPI, SQLAlchemy (raw SQL), psycopg2, PyJWT, bcrypt, pandas, NumPy, SciPy, Plotly, cryptography, APScheduler, Redis, httpx

**Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, TanStack Query, TanStack Table, Monaco Editor, react-grid-layout, Plotly.js, cmdk, next-themes, exceljs, jsPDF, Zustand, Sonner

**Infrastructure:** Docker Compose, nginx, PostgreSQL 16, Redis 7, Let's Encrypt (certbot)

---

## Documentation

- **[Quickstart](docs/quickstart.md)** — get running in 5 minutes
- **[User Guide](docs/user-guide.md)** — connections, SQL Lab, dashboards, charts, formatting, collaboration, administration
- **[Deployment Guide](docs/deployment-guide.md)** — production deployment, SSL, backups, monitoring, security hardening
- **[Contributing](CONTRIBUTING.md)** — development setup, code style, PR process

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

Copyright 2026 Karta Contributors.
