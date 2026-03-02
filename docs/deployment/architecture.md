# Architecture

## Service Diagram

```
                    ┌─────────────┐
                    │    nginx    │ :80 / :443
                    │  (proxy)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      /api/auth/*      /api/*         /*
              │            │            │
       ┌──────▼──────┐  ┌─▼────────┐  │
       │  frontend   │  │   api    │  │
       │  (Next.js)  │  │ (FastAPI)│  │
       │   :3000     │  │  :8000   │  │
       └─────────────┘  └────┬─────┘  │
                              │        │
                    ┌─────────┼────────┘
                    │         │
              ┌─────▼───┐  ┌─▼──────────┐
              │  redis  │  │  postgres   │
              │  :6379  │  │   :5432     │
              └─────────┘  └────────────┘
```

## Services

| Service | Stack | Purpose | Memory |
|---------|-------|---------|--------|
| **postgres** | PostgreSQL 16 Alpine | Internal metadata DB | 1 GB |
| **api** | Python 3.13, FastAPI | REST API backend | 4 GB |
| **frontend** | Node 25, Next.js 16, React 19 | Web UI | 768 MB |
| **nginx** | nginx:alpine | Reverse proxy + SSL | 256 MB |
| **redis** | Redis 7 Alpine | Query result cache | 256 MB |
| **mcp** | MCP Server (optional) | Model Context Protocol server | 256 MB |
| **jackson** | BoxyHQ SAML (enterprise) | SAML SSO provider | default |

All services have health checks, restart policies (`unless-stopped`), and JSON logging with rotation (10 MB per file, 3 files retained).

## Network

All services communicate on a Docker bridge network. Only nginx exposes ports to the host.

| Port | Service | External? |
|------|---------|-----------|
| 80/443 | nginx | Yes |
| 3000 | frontend | No |
| 8000 | api | No |
| 5432 | postgres | No |
| 6379 | redis | No |
| 8811 | mcp | No |
| 5225 | jackson | No |

## Data Storage

| Data | Location | Persistence |
|------|----------|-------------|
| **Metadata** (dashboards, charts, users) | PostgreSQL `karta` DB | Docker volume `pgdata` |
| **Query cache** | Redis | In-memory, lost on restart |
| **User data** | External databases | Not stored in Karta |
| **Uploaded files** (CSV/Parquet) | `data/csv/` volume | Persistent (Docker bind mount) |
| **DuckDB databases** | `data/csv/uploads.duckdb` | Persistent |

## Request Flow

1. Browser sends request to **nginx** (:80/:443)
2. Nginx routes based on path:
   - `/api/auth/*` → **frontend** (NextAuth handles auth)
   - `/api/*` → **api** (FastAPI handles data)
   - `/*` → **frontend** (Next.js serves UI)
3. **api** queries **postgres** for metadata and external databases for user data
4. **api** checks **redis** for cached results before executing queries
5. Responses flow back through nginx to the browser
