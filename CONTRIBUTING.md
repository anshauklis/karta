# Contributing to Karta

Thank you for your interest in contributing to Karta! This guide will help you get started.

## Development Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for frontend development)
- Python 3.11+ (for API development)
- 3GB+ RAM available for Docker

### Quick Start

```bash
git clone https://github.com/anshauklis/karta.git
cd karta
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD, JWT_SECRET, CONNECTION_SECRET
docker compose up --build -d
```

Open http://localhost and create your admin account.

### Frontend Development

```bash
cd frontend
npm install
cp .env.local.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                        # Starts on :3001
```

### API Development

```bash
cd api
uv sync
DATABASE_URL="postgresql://karta:karta@localhost:5432/karta" \
JWT_SECRET="dev-secret" \
CONNECTION_SECRET="dev-conn-secret" \
  uv run uvicorn api.main:app --reload --port 8000
```

## Code Style

- **Python**: Formatted with [ruff](https://docs.astral.sh/ruff/). Run `ruff check api/` before committing.
- **TypeScript**: Linted with ESLint. Run `npm run lint` in `frontend/` before committing.
- **No ORM**: Backend uses raw SQL with SQLAlchemy `text()` queries and parameterized bindings.
- **shadcn/ui**: Frontend uses shadcn/ui components. Add new ones with `npx shadcn add <component>`.

## Project Structure

```
karta/
  api/              # FastAPI backend
    charts/         # Chart CRUD + execution
    connections/    # Database connector management
    dashboards/     # Dashboard CRUD
    ai/             # AI features (text-to-SQL, chart builder, insights)
    executor.py     # Chart rendering engine (21+ types)
    database.py     # Schema DDL + auto-migration
  frontend/         # Next.js 16 App Router
    src/
      app/          # Route pages
      components/   # Reusable UI components
      hooks/        # TanStack Query hooks
      lib/          # Utilities (api client, code generation)
      types/        # TypeScript interfaces
  nginx.conf        # Reverse proxy config
  docker-compose.yml
```

See `CLAUDE.md` for detailed architecture documentation.

## Pull Request Process

1. **Branch from `main`** — use descriptive branch names: `feat/ai-chart-builder`, `fix/pivot-null-handling`
2. **One feature per PR** — keep changes focused and reviewable
3. **Descriptive commits** — use conventional commits: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`
4. **Test your changes** — run `docker compose up --build -d` and verify in the browser
5. **Lint before pushing** — `ruff check api/` and `cd frontend && npm run lint`

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce, expected vs actual behavior, and browser/OS info
- For security issues, email directly instead of opening a public issue

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
