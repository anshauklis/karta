# Expanded Integration Tests Design — Karta

**Date:** 2026-03-03
**Status:** Approved
**Scope:** Backend integration tests for core CRUD endpoints

## Context

Phase 1 testing (current `feat/testing-infrastructure` branch) delivered ~100 tests: 69 backend unit tests across 5 modules, 6 auth integration tests, and ~55 frontend unit tests. All API CRUD endpoints beyond auth remain untested.

## Goal

Add integration tests for the 5 core API areas: dashboards, connections, datasets, charts, sql-lab. Target: ~35 new tests.

## Approach: Shared fixture chain

Entities have dependencies: `connections → datasets → charts`, `dashboards → charts (optional)`. Tests share session-scoped fixtures that create entities in order, avoiding expensive per-test setup.

### Fixture Chain

```
admin_token (session)     — first registered user = admin
test_connection (session) — DuckDB :memory: via admin_token
test_dataset (session)    — virtual dataset on test_connection
test_dashboard (session)  — dashboard with auto-created tab
test_chart (session)      — chart on test_dashboard with test_dataset
```

**DuckDB :memory:** as test connection — no external server needed, supports real SQL execution.

**No cleanup needed** — unique names via UUID, single test DB per session.

## Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `test_dashboards.py` | ~8 | Create, get by ID, get by slug, update, list, clone, delete, delete nonexistent |
| `test_connections.py` | ~6 | Engine specs, create (admin), list, schemas, delete, non-admin rejected |
| `test_datasets.py` | ~7 | Create virtual, get, update, list, preview, columns, duplicate name rejected |
| `test_charts.py` | ~10 | Create on dashboard, create standalone, get, update, list, execute, preview, duplicate, delete, bulk-delete |
| `test_sql_lab.py` | ~4 | Execute valid SQL, execute invalid SQL (blocked), validate endpoint, missing connection |

**Total: ~35 new integration tests**

## Key Decisions

- `admin_token` is session-scoped — first registered user is auto-admin
- `auth_token` (existing) gives a regular user for permission tests
- DuckDB connection type avoids SSRF validation and external DB dependency
- Chart execute tested with `SELECT 1 as value` via DuckDB — validates full pipeline
- Tests ordered within each file to build on each other (create → read → update → delete)
