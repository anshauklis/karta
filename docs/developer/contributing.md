# Contributing

## Prerequisites

- Docker and Docker Compose v2+
- Node.js 25+ and npm (for frontend development)
- Python 3.13+ and `uv` (for API development)

## Project Structure

```
karta/
+-- api/                 # FastAPI backend (Python)
|   +-- ai/             # AI assistant endpoints
|   +-- auth/           # Authentication
|   +-- charts/         # Chart CRUD and execution
|   +-- connections/    # Database connections
|   +-- dashboards/     # Dashboard CRUD
|   +-- database.py     # Schema DDL, migrations
|   +-- executor.py     # Chart rendering engine
|   +-- models.py       # Pydantic models
|   +-- ...
+-- frontend/           # Next.js 16 frontend
|   +-- src/app/        # App Router pages
|   +-- src/components/ # React components
|   +-- src/hooks/      # TanStack Query hooks
|   +-- src/lib/        # Utilities (api client, etc.)
|   +-- messages/       # i18n (en.json, ru.json)
+-- docs/               # Sphinx documentation
+-- nginx.conf          # Reverse proxy config
+-- docker-compose.yml  # Service orchestration
+-- install.sh          # One-click installer
```

## Development Setup

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3001
npm run lint         # ESLint check
npm run build        # Production build
```

### API

```bash
cd api
uv sync
uv run ruff check .  # Linter
```

### Full Stack

```bash
docker compose up --build -d
docker compose logs -f api       # API logs
docker compose logs -f frontend  # Frontend logs
```

:::{warning}
After any code change, **always** run `docker compose up --build -d` (full rebuild).
Partial restarts (`docker compose restart api`) do **NOT** pick up code changes.
:::

## Key Conventions

- **No ORM** --- backend uses raw SQL with parameterized queries via SQLAlchemy
  `text()`. No models mapped to tables.
- **Package managers** --- API: `uv` (`pyproject.toml` + `uv.lock`). Frontend: `npm`
  (`package.json` + `package-lock.json`).
- **API auth** --- all endpoints require `Bearer <JWT>` via `Depends(get_current_user)`.
  Admin routes add `Depends(require_admin)`.
- **i18n** --- use `useTranslations()` from `next-intl`. Add keys to both
  `messages/en.json` and `messages/ru.json`.
- **Components** --- use existing shadcn/ui components from
  `frontend/src/components/ui/`. Add new ones with `npx shadcn add <component>`.
- **Schema changes** --- add to `SCHEMA_SQL` in `api/database.py`. Uses
  `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS`.

## Code Style

- **Python**: Ruff linter (`uv run ruff check .`). No specific formatter enforced.
- **TypeScript**: ESLint with Next.js config (`npm run lint`).
- Code and comments in English. UI text via i18n.

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes and verify linting passes
4. Commit with conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:`
5. Push and open a Pull Request against `main`

:::{tip}
Run both linters before submitting:

```bash
cd api && uv run ruff check .
cd frontend && npm run lint
```
:::
