# Testing Strategy Design — Karta

**Date:** 2026-03-03
**Status:** Approved
**Approach:** Bottom-up (unit → integration), both stacks in parallel

## Context

Karta has zero test coverage — no pytest, no Vitest, no CI test gates. Only linting (Ruff + ESLint) runs in CI.

## Tools

| Stack | Framework | Runner | Extras |
|-------|-----------|--------|--------|
| Backend | pytest + pytest-asyncio | `uv run pytest` | httpx (TestClient), test PostgreSQL in CI |
| Frontend | Vitest | `npm test` | @testing-library/react, MSW (later) |
| CI | GitHub Actions | `.github/workflows/test.yml` | Separate jobs: api-tests, frontend-tests |

## Backend Tests

### Tier 1 — Unit Tests (~80 tests, pure functions)

| Module | Tests | Coverage |
|--------|-------|----------|
| `sql_validator.py` | ~25 | Valid SELECT/WITH, block INSERT/DROP/functions, comment/string bypass, stacked queries, auto-LIMIT |
| `sql_params.py` | ~15 | Variable extraction, substitution (text/number/date), NULL, injection via vars, invalid float |
| `crypto.py` | ~10 | Encrypt/decrypt round-trip, legacy fallback, missing key |
| `auth/jwt.py` | ~8 | Encode/decode, expiry, invalid token, missing secret |
| `pipeline_sql.py` | ~15 | CTE generation for filters/time grain/calc columns/metrics, empty configs |
| `models.py` | ~10 | Pydantic validation of key models (invalid email, empty fields, boundary values) |

### Tier 2 — Integration Tests (~30 tests, FastAPI TestClient + PostgreSQL)

| Area | Tests | Coverage |
|------|-------|----------|
| Auth endpoints | ~10 | Register → login → me, duplicate email, invalid password, admin-only routes |
| Charts CRUD | ~8 | Create/read/update/delete chart, execute with test data |
| Connections | ~5 | Create with encrypted password, test connection |
| Dashboards | ~5 | CRUD + layout update |
| SQL Lab | ~3 | Execute valid/invalid SQL |

Fixtures: test PostgreSQL, seed data (test user, connection, dataset).

## Frontend Tests

### Tier 1 — Unit Tests (~70 tests, pure functions)

| Module | Tests | Coverage |
|--------|-------|----------|
| `generate-code.ts` | ~20 | Code generation per chart type, pivot, table, empty config |
| `parse-code.ts` | ~20 | Parse Python code back to config, round-trip with generate-code |
| `format.ts` | ~10 | All format types: date, number, currency, percent, edge cases |
| `date-format.ts` | ~8 | Each grain (day/week/month/quarter/year), custom format |
| `extract-tables.ts` | ~8 | FROM/JOIN, CTE, nested queries, comments |
| `cron-describe.ts` | ~5 | All patterns (minutes, hours, days, weekdays) |

## CI Pipeline

New workflow `.github/workflows/test.yml`:
- `api-tests` job: PostgreSQL service, `uv sync --dev`, `uv run pytest`
- `frontend-tests` job: `npm ci`, `npm test`
- Runs on push to main and on PRs

## File Structure

```
api/
  tests/
    conftest.py           # Fixtures: DB engine, test client, auth token
    test_sql_validator.py
    test_sql_params.py
    test_crypto.py
    test_jwt.py
    test_pipeline_sql.py
    test_models.py
    integration/
      conftest.py         # DB setup/teardown, seed data
      test_auth.py
      test_charts.py
      test_connections.py
      test_dashboards.py
      test_sql_lab.py

frontend/
  vitest.config.ts
  src/lib/__tests__/
    generate-code.test.ts
    parse-code.test.ts
    format.test.ts
    date-format.test.ts
    extract-tables.test.ts
    cron-describe.test.ts
```

## Success Criteria

- All unit tests pass locally in < 10 seconds
- CI runs tests on every PR, blocks merge on failure
- ~150 tests total (80 backend unit + 30 backend integration + 70 frontend unit)
