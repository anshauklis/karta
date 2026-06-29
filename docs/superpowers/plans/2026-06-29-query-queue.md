# Async Query Queue (RQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offload SQL Lab and chart/dashboard execution onto RQ worker processes via a blocking submit-and-wait bridge, behind a feature flag, with no frontend changes.

**Architecture:** Extract the synchronous heavy core of each path (SQL exec, chart pipeline) into worker-callable task functions returning JSON-serializable payloads. A `job_queue` module enqueues a task on a Redis-backed RQ queue and blocks polling for the result with a timeout. Endpoints choose the queue path or the existing inline `asyncio.to_thread` path based on `QUERY_QUEUE_ENABLED`. A new `worker` Docker service runs `rq worker`.

**Tech Stack:** Python 3.13, FastAPI, RQ (Redis Queue), existing Redis, DuckDB/pandas/Plotly, uv, Docker Compose.

## Global Constraints

- Package manager: `uv` (api/pyproject.toml + uv.lock). Add deps via `uv add`.
- No frontend changes. HTTP request/response contracts stay identical.
- Feature flag `QUERY_QUEUE_ENABLED` defaults OFF → behaviour unchanged; CI/tests unaffected.
- Lint must stay clean: `uvx ruff check api/` (run from repo root) passes.
- Windows test quirk: run unit tests as `cd api && uv run pytest tests/ -q --ignore=tests/integration --ignore=tests/test_dataset_dimensions_api.py --ignore=tests/test_dataset_measures_api.py`.
- Deploy is on the eval server only (see memory `deploy-eval-server`): ship changed files via tar over ssh, then `docker compose -p karta up -d --build <svc>`; never re-tar the whole repo.
- Both worker and api use the same `./api` image and share the `./data/csv` volume (parquet cache + DuckDB).

---

### Task 1: `job_queue` module — RQ queue + blocking submit-and-wait

**Files:**
- Modify: `api/pyproject.toml` (add `rq` dependency)
- Create: `api/job_queue.py`
- Test: `api/tests/test_job_queue.py`

**Interfaces:**
- Produces:
  - `queue_enabled() -> bool` — True when `QUERY_QUEUE_ENABLED` env is truthy.
  - `get_queue() -> rq.Queue` — RQ Queue named `"karta"` on `REDIS_URL`.
  - `class QueueBusy(Exception)` — raised when `max_wait` elapses with the job unfinished.
  - `class QueueJobError(Exception)` — raised when the worker job fails (carries the worker traceback string).
  - `submit_and_wait(func, kwargs: dict, *, job_timeout: int, max_wait: float, queue=None, poll_interval: float = 0.1)` — enqueue `func(**kwargs)`, poll until finished (return its result), failed (raise `QueueJobError`), or `max_wait` exceeded (raise `QueueBusy`). `queue` is injectable for tests.

- [ ] **Step 1: Add the RQ dependency**

Run: `cd api && uv add rq`
Expected: `rq` appears in `pyproject.toml` dependencies and `uv.lock` updates.

- [ ] **Step 2: Write the failing test**

Create `api/tests/test_job_queue.py`:

```python
import time
import pytest

from api.job_queue import submit_and_wait, queue_enabled, QueueBusy, QueueJobError


class _StubJob:
    def __init__(self, statuses, result=None, exc_info=None):
        self._statuses = list(statuses)
        self._result = result
        self.exc_info = exc_info

    def get_status(self, refresh=True):
        # Hold on the last status once the script is exhausted.
        return self._statuses.pop(0) if len(self._statuses) > 1 else self._statuses[0]

    def return_value(self):
        return self._result


class _StubQueue:
    def __init__(self, job):
        self._job = job
        self.enqueued = None

    def enqueue(self, func, **kw):
        self.enqueued = (func, kw)
        return self._job


def _noop(**_kw):
    return None


def test_returns_worker_result_when_finished():
    q = _StubQueue(_StubJob(["queued", "started", "finished"], result={"ok": 1}))
    out = submit_and_wait(_noop, {"a": 1}, job_timeout=5, max_wait=5, queue=q, poll_interval=0)
    assert out == {"ok": 1}
    assert q.enqueued[1]["kwargs"] == {"a": 1}


def test_raises_queue_job_error_on_failure():
    q = _StubQueue(_StubJob(["failed"], exc_info="Traceback ... ValueError: boom"))
    with pytest.raises(QueueJobError):
        submit_and_wait(_noop, {}, job_timeout=5, max_wait=5, queue=q, poll_interval=0)


def test_raises_queue_busy_on_timeout():
    q = _StubQueue(_StubJob(["queued"]))  # never finishes
    with pytest.raises(QueueBusy):
        submit_and_wait(_noop, {}, job_timeout=5, max_wait=0.05, queue=q, poll_interval=0.01)


def test_queue_enabled_reads_env(monkeypatch):
    monkeypatch.setenv("QUERY_QUEUE_ENABLED", "true")
    assert queue_enabled() is True
    monkeypatch.setenv("QUERY_QUEUE_ENABLED", "0")
    assert queue_enabled() is False
    monkeypatch.delenv("QUERY_QUEUE_ENABLED", raising=False)
    assert queue_enabled() is False
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd api && uv run pytest tests/test_job_queue.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.job_queue'`.

- [ ] **Step 4: Write the implementation**

Create `api/job_queue.py`:

```python
"""RQ-backed query queue: a blocking submit-and-wait bridge so the API can offload
heavy execution to worker processes while keeping the synchronous HTTP contract.
Enabled by QUERY_QUEUE_ENABLED; otherwise callers use the inline path.
"""
import os
import time

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = "karta"


class QueueBusy(Exception):
    """No worker produced a result within max_wait — apply backpressure."""


class QueueJobError(Exception):
    """The worker job failed; message carries the worker traceback."""


def queue_enabled() -> bool:
    return os.environ.get("QUERY_QUEUE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def get_queue():
    from redis import Redis
    from rq import Queue
    return Queue(QUEUE_NAME, connection=Redis.from_url(REDIS_URL))


def submit_and_wait(func, kwargs: dict, *, job_timeout: int, max_wait: float,
                    queue=None, poll_interval: float = 0.1):
    """Enqueue func(**kwargs) and block until it finishes.

    Returns the worker's return value. Raises QueueJobError if the job fails and
    QueueBusy if max_wait elapses before completion.
    """
    q = queue if queue is not None else get_queue()
    job = q.enqueue(
        func,
        kwargs=kwargs,
        job_timeout=job_timeout,
        result_ttl=60,
        failure_ttl=60,
    )
    deadline = time.monotonic() + max_wait
    while True:
        status = job.get_status(refresh=True)
        if status == "finished":
            return job.return_value()
        if status in ("failed", "stopped", "canceled"):
            raise QueueJobError(getattr(job, "exc_info", None) or f"job {status}")
        if time.monotonic() >= deadline:
            raise QueueBusy("All workers are busy; please retry shortly")
        time.sleep(poll_interval)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && uv run pytest tests/test_job_queue.py -q`
Expected: PASS (4 tests).

- [ ] **Step 6: Lint + commit**

Run: `cd /c/projects/karta && uvx ruff check api/job_queue.py api/tests/test_job_queue.py`
Expected: All checks passed.

```bash
git add api/pyproject.toml api/uv.lock api/job_queue.py api/tests/test_job_queue.py
git commit -m "feat(queue): RQ job_queue module with blocking submit_and_wait"
```

---

### Task 2: Extract the chart pipeline's synchronous core

**Files:**
- Modify: `api/charts/router.py` (`_run_chart_pipeline`, ~lines 1377-1483)

**Interfaces:**
- Produces:
  - `run_chart_pipeline_sync(*, connection_id, sql_query, chart_config, mode, chart_type, chart_code, variables, variable_values, filters, uid, pq_ttl) -> dict`
    — a **synchronous** function containing all of `_run_chart_pipeline`'s logic, returning a JSON-serializable dict with the `ChartExecuteResponse` fields (`figure, columns, rows, row_count, error, formatting, pivot_header_levels, pivot_row_index_count, pivot_cond_format_meta`). It calls `_execute_chart_full` directly (no `asyncio.to_thread`).
- Consumes: existing `_execute_chart_full`, `_classify_error`, `_sanitize_figure`, `_sanitize_rows`, `build_visual_chart`, `build_pivot_table`, `execute_chart_code`, `_rename_pivot_custom_cols`, `_has_custom_sql`, `_build_custom_sql_query`, `_has_pivot_custom_sql`, `_build_pivot_custom_sql_query`.

- [ ] **Step 1: Add `run_chart_pipeline_sync`**

In `api/charts/router.py`, add a new synchronous function with the body of the current `_run_chart_pipeline`, but: (a) drop `async`/`await` — call `_execute_chart_full(...)` directly; (b) every `return ChartExecuteResponse(...)` becomes `return {...}` with the same field names; (c) the final return is a dict too. Example of the converted tail:

```python
def run_chart_pipeline_sync(*, connection_id, sql_query, chart_config, mode,
                            chart_type, chart_code, variables, variable_values,
                            filters, uid, pq_ttl) -> dict:
    """Synchronous chart execution core (data + figure). Worker-callable; returns a
    JSON-serializable dict of ChartExecuteResponse fields. Same logic as the former
    async _run_chart_pipeline, minus the to_thread boundary."""
    from api.sql_params import extract_variables, substitute as var_substitute

    vars_ = variables or []
    var_defaults = {v["name"]: v.get("default") for v in vars_ if v.get("name")}
    var_types = {v["name"]: v.get("type", "text") for v in vars_ if v.get("name")}
    if extract_variables(sql_query):
        try:
            sql_query = var_substitute(sql_query, variable_values or {}, var_defaults, var_types)
        except ValueError as e:
            return {"error": _classify_error(e)}

    skip_metrics = False
    if _has_custom_sql(chart_config):
        try:
            sql_query, skip_metrics = _build_custom_sql_query(sql_query, chart_config)
        except Exception as e:
            return {"error": _classify_error(e)}
    if _has_pivot_custom_sql(chart_config):
        try:
            sql_query = _build_pivot_custom_sql_query(sql_query, chart_config)
        except Exception as e:
            return {"error": _classify_error(e)}

    try:
        columns, _rows, df, pq_path = _execute_chart_full(
            connection_id, sql_query, chart_config, filters, uid, skip_metrics,
            pq_ttl, include_rows=False)
    except Exception as e:
        return {"error": _classify_error(e)}

    df = _rename_pivot_custom_cols(df, chart_config)
    columns = list(df.columns)
    row_count = len(df)

    figure = None
    error = None
    try:
        if mode == "visual" and chart_type == "pivot":
            pivot_result = build_pivot_table(chart_config, df)
            return {
                "figure": None,
                "columns": pivot_result["columns"],
                "rows": pivot_result["rows"],
                "row_count": pivot_result["row_count"],
                "error": None,
                "formatting": pivot_result["formatting"],
                "pivot_header_levels": pivot_result["pivot_header_levels"],
                "pivot_row_index_count": pivot_result["pivot_row_index_count"],
                "pivot_cond_format_meta": pivot_result.get("pivot_cond_format_meta"),
            }
        elif mode == "visual":
            figure = build_visual_chart(chart_type, chart_config, df)
        elif mode == "code":
            code_result = execute_chart_code(chart_code, df, parquet_path=pq_path)
            if isinstance(code_result, dict) and code_result.get("_table"):
                return {
                    "figure": None,
                    "columns": [str(c) for c in code_result["columns"]],
                    "rows": [list(r) for r in code_result["rows"][:500]],
                    "row_count": code_result["row_count"],
                    "error": None,
                    "pivot_header_levels": code_result.get("pivot_header_levels"),
                    "pivot_row_index_count": code_result.get("pivot_row_index_count"),
                }
            figure = code_result
    except Exception as e:
        error = _classify_error(e)

    formatting = chart_config.get("conditional_formatting", []) if chart_config else []
    return {
        "figure": _sanitize_figure(figure),
        "columns": [str(c) for c in columns],
        "rows": _sanitize_rows(df.head(200)),
        "row_count": row_count,
        "error": error,
        "formatting": formatting,
    }
```

- [ ] **Step 2: Rewrite `_run_chart_pipeline` to delegate (inline path only for now)**

Replace the body of the async `_run_chart_pipeline` with:

```python
async def _run_chart_pipeline(*, connection_id, sql_query, chart_config, mode,
                              chart_type, chart_code, variables, variable_values,
                              filters, uid, pq_ttl) -> ChartExecuteResponse:
    payload = await asyncio.to_thread(
        run_chart_pipeline_sync,
        connection_id=connection_id, sql_query=sql_query, chart_config=chart_config,
        mode=mode, chart_type=chart_type, chart_code=chart_code, variables=variables,
        variable_values=variable_values, filters=filters, uid=uid, pq_ttl=pq_ttl)
    return ChartExecuteResponse(**payload)
```

- [ ] **Step 3: Verify the existing suite still passes (no behaviour change)**

Run: `cd api && uv run pytest tests/ -q --ignore=tests/integration --ignore=tests/test_dataset_dimensions_api.py --ignore=tests/test_dataset_measures_api.py`
Expected: same pass count as before this task (no failures).

- [ ] **Step 4: Lint + commit**

Run: `cd /c/projects/karta && uvx ruff check api/charts/router.py`
Expected: All checks passed.

```bash
git add api/charts/router.py
git commit -m "refactor(charts): extract synchronous run_chart_pipeline_sync core"
```

---

### Task 3: Extract the SQL Lab execution core

**Files:**
- Modify: `api/sql_lab/router.py` (`execute_sql`, ~lines 44-130)

**Interfaces:**
- Produces:
  - `run_sql_core(connection_id: int, clean_sql: str, max_fetch: int) -> dict`
    — synchronous; returns `{"columns": [...], "rows": [...], "execution_time_ms": int}` with rows already JSON-coerced. Raises on execution failure (caller maps to HTTP 400).
- Consumes: `_get_connection_with_password`, `get_engine_for_connection`.

- [ ] **Step 1: Add `run_sql_core`**

In `api/sql_lab/router.py`, extract lines that build the connection, run the query, and coerce rows (the body between "Get connection" and the cache write) into:

```python
def run_sql_core(connection_id: int, clean_sql: str, max_fetch: int) -> dict:
    """Synchronous SQL execution core. Worker-callable; returns JSON-serializable
    {columns, rows, execution_time_ms}. Raises on execution failure."""
    c = _get_connection_with_password(connection_id)
    engine, spec = get_engine_for_connection(c)
    start = time.time()
    if c["db_type"] == "duckdb":
        import numbers
        df = spec.execute_native(c["database_name"], clean_sql)
        columns = list(df.columns)
        rows = [list(row) for row in df.head(max_fetch).itertuples(index=False, name=None)]
        for i, row in enumerate(rows):
            for j, val in enumerate(row):
                if val is None or isinstance(val, (str, bool, int, float)):
                    continue
                if isinstance(val, numbers.Integral):
                    rows[i][j] = int(val)
                elif isinstance(val, numbers.Real):
                    rows[i][j] = float(val)
                else:
                    try:
                        rows[i][j] = float(val)
                    except (TypeError, ValueError):
                        rows[i][j] = str(val)
    else:
        with engine.connect() as conn:
            spec.set_timeout(conn, 30)
            result = conn.execute(text(clean_sql))
            columns = list(result.keys())
            rows = [list(row) for row in result.fetchmany(max_fetch)]
            from decimal import Decimal
            import numbers
            for i, row in enumerate(rows):
                for j, val in enumerate(row):
                    if val is None or isinstance(val, (str, bool, int, float)):
                        continue
                    if isinstance(val, Decimal):
                        rows[i][j] = float(val)
                    elif isinstance(val, numbers.Integral):
                        rows[i][j] = int(val)
                    elif isinstance(val, numbers.Real):
                        rows[i][j] = float(val)
                    else:
                        try:
                            rows[i][j] = float(val)
                        except (TypeError, ValueError):
                            rows[i][j] = str(val)
    elapsed = int((time.time() - start) * 1000)
    return {"columns": columns, "rows": rows, "execution_time_ms": elapsed}
```

- [ ] **Step 2: Rewrite the `execute_sql` body between connection and cache to call the core**

```python
    c_max_fetch = min(getattr(req, "limit", 1000), 10_000)
    try:
        core = run_sql_core(req.connection_id, clean_sql, c_max_fetch)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")
    columns, rows, elapsed = core["columns"], core["rows"], core["execution_time_ms"]

    set_cached(key, {"columns": columns, "rows": rows})
    return SQLExecuteResponse(
        columns=columns,
        rows=rows[:req.limit],
        row_count=len(rows),
        execution_time_ms=elapsed,
    )
```

- [ ] **Step 3: Verify the existing suite still passes**

Run: `cd api && uv run pytest tests/ -q --ignore=tests/integration --ignore=tests/test_dataset_dimensions_api.py --ignore=tests/test_dataset_measures_api.py`
Expected: same pass count as before (no failures).

- [ ] **Step 4: Lint + commit**

Run: `cd /c/projects/karta && uvx ruff check api/sql_lab/router.py`
Expected: All checks passed.

```bash
git add api/sql_lab/router.py
git commit -m "refactor(sql-lab): extract synchronous run_sql_core"
```

---

### Task 4: Worker tasks + flag dispatch in both endpoints

**Files:**
- Create: `api/tasks.py`
- Modify: `api/charts/router.py` (`_run_chart_pipeline` dispatch)
- Modify: `api/sql_lab/router.py` (`execute_sql` dispatch)

**Interfaces:**
- Produces:
  - `execute_chart_task(**kwargs) -> dict` — module-level; calls `run_chart_pipeline_sync(**kwargs)`.
  - `execute_sql_task(connection_id, clean_sql, max_fetch) -> dict` — module-level; calls `run_sql_core(...)`.
- Consumes: `run_chart_pipeline_sync` (Task 2), `run_sql_core` (Task 3), `job_queue.submit_and_wait`/`queue_enabled`/`QueueBusy` (Task 1).

Note: task functions live in `api/tasks.py` (a stable import path for the worker) and must be top-level (RQ pickles by reference `api.tasks.execute_chart_task`).

- [ ] **Step 1: Create `api/tasks.py`**

```python
"""Worker-callable task functions. Imported by reference (api.tasks.*) by RQ
workers, and called inline by the API when the queue is disabled. Each returns a
JSON-serializable dict."""
from api.charts.router import run_chart_pipeline_sync
from api.sql_lab.router import run_sql_core


def execute_chart_task(**kwargs) -> dict:
    return run_chart_pipeline_sync(**kwargs)


def execute_sql_task(connection_id: int, clean_sql: str, max_fetch: int) -> dict:
    return run_sql_core(connection_id, clean_sql, max_fetch)
```

- [ ] **Step 2: Dispatch in the chart pipeline**

Update `_run_chart_pipeline` (Task 2) to choose queue vs inline:

```python
async def _run_chart_pipeline(*, connection_id, sql_query, chart_config, mode,
                              chart_type, chart_code, variables, variable_values,
                              filters, uid, pq_ttl) -> ChartExecuteResponse:
    from api import job_queue
    kwargs = dict(connection_id=connection_id, sql_query=sql_query,
                  chart_config=chart_config, mode=mode, chart_type=chart_type,
                  chart_code=chart_code, variables=variables,
                  variable_values=variable_values, filters=filters, uid=uid,
                  pq_ttl=pq_ttl)
    if job_queue.queue_enabled():
        from api.tasks import execute_chart_task
        try:
            payload = await asyncio.to_thread(
                job_queue.submit_and_wait, execute_chart_task, kwargs,
                job_timeout=300, max_wait=90)
        except job_queue.QueueBusy:
            return ChartExecuteResponse(error={
                "code": "SERVER_BUSY",
                "message": "Server is busy, please retry shortly",
                "detail": "All query workers are occupied"})
        except Exception:
            # Redis/worker unavailable → graceful inline fallback
            payload = await asyncio.to_thread(run_chart_pipeline_sync, **kwargs)
    else:
        payload = await asyncio.to_thread(run_chart_pipeline_sync, **kwargs)
    return ChartExecuteResponse(**payload)
```

- [ ] **Step 3: Dispatch in SQL Lab**

In `execute_sql`, replace the direct `run_sql_core(...)` call (Task 3, Step 2) with:

```python
    from api import job_queue
    try:
        if job_queue.queue_enabled():
            from api.tasks import execute_sql_task
            try:
                core = job_queue.submit_and_wait(
                    execute_sql_task,
                    {"connection_id": req.connection_id, "clean_sql": clean_sql, "max_fetch": c_max_fetch},
                    job_timeout=120, max_wait=90)
            except job_queue.QueueBusy:
                raise HTTPException(status_code=503, detail="Server is busy, please retry shortly")
            except job_queue.QueueJobError as e:
                raise HTTPException(status_code=400, detail=f"Query execution failed: {e}")
        else:
            core = run_sql_core(req.connection_id, clean_sql, c_max_fetch)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")
```

- [ ] **Step 4: Verify the suite still passes (flag off = inline path)**

Run: `cd api && uv run pytest tests/ -q --ignore=tests/integration --ignore=tests/test_dataset_dimensions_api.py --ignore=tests/test_dataset_measures_api.py`
Expected: same pass count (no failures); `QUERY_QUEUE_ENABLED` unset, so inline path runs.

- [ ] **Step 5: Lint + commit**

Run: `cd /c/projects/karta && uvx ruff check api/`
Expected: All checks passed.

```bash
git add api/tasks.py api/charts/router.py api/sql_lab/router.py
git commit -m "feat(queue): route chart + SQL execution through the queue behind QUERY_QUEUE_ENABLED"
```

---

### Task 5: Worker service in Docker Compose

**Files:**
- Modify: `docker-compose.yml` (add `worker` service)
- Modify: `docker-compose.ghcr.yml` (add `worker` service using the GHCR api image)

**Interfaces:**
- Produces: a `worker` container running `rq worker karta`, sharing the api image, env, and `./data/csv` volume; depends on redis.

- [ ] **Step 1: Add the worker service to `docker-compose.yml`**

After the `api` service block, add (mirror api's `environment`, `volumes`, `depends_on`):

```yaml
  worker:
    build: ./api
    restart: unless-stopped
    command: ["uv", "run", "rq", "worker", "karta", "--url", "${REDIS_URL:-redis://:${REDIS_PASSWORD:-changeme}@redis:6379/0}"]
    environment:
      DATABASE_URL: postgresql://karta:${POSTGRES_PASSWORD}@postgres:5432/karta
      JWT_SECRET: ${JWT_SECRET}
      CONNECTION_SECRET: ${CONNECTION_SECRET}
      REDIS_URL: redis://:${REDIS_PASSWORD:-changeme}@redis:6379/0
      QUERY_QUEUE_ENABLED: ${QUERY_QUEUE_ENABLED:-false}
      AI_API_URL: ${AI_API_URL:-}
      AI_API_KEY: ${AI_API_KEY:-}
      AI_MODEL: ${AI_MODEL:-gpt-4o}
      AI_ENABLED: ${AI_ENABLED:-false}
    volumes:
      - ./data/csv:/app/data/csv
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    mem_limit: 4g
    deploy:
      replicas: ${WORKER_REPLICAS:-2}
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

- [ ] **Step 2: Add the same service to `docker-compose.ghcr.yml`**

Use the prebuilt image instead of `build:` (match how `api` is declared there, e.g. `image: ghcr.io/.../karta-api:latest`), keeping the same `command`, `environment`, `volumes`, `depends_on`.

- [ ] **Step 3: Validate compose config locally**

Run: `cd /c/projects/karta && docker compose -f docker-compose.yml config >/dev/null && echo OK`
Expected: `OK` (no YAML/interpolation errors). (Docker not required to run; `config` only parses.)

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.ghcr.yml
git commit -m "feat(queue): add rq worker service to compose"
```

---

### Task 6: Integration verification on the eval server

**Files:** none (verification only). Uses the eval server from memory `deploy-eval-server`.

**Interfaces:** none.

- [ ] **Step 1: Ship changed files + the override env**

Ship `api/` changes + both compose files via tar over ssh (per memory). Add `QUERY_QUEUE_ENABLED=true` to the server's `~/karta/docker-compose.analytics.yml` api+worker env (or `.env`), then rebuild:

Run (from repo root): tar the changed paths to `~/karta`, then on the server:
`cd ~/karta && docker compose -p karta up -d --build api worker`
Expected: `karta-api-1` healthy; `karta-worker-1`/`-2` started.

- [ ] **Step 2: Confirm workers pick up jobs**

Open a dashboard / run a chart on the ClickHouse connection, then:
`docker logs karta-worker-1 --tail 20`
Expected: log lines showing `karta` jobs processed (`execute_chart_task` / `execute_sql_task`).

- [ ] **Step 3: Confirm correctness parity**

Run the same chart with the flag on vs off (toggle `QUERY_QUEUE_ENABLED`, recreate api) and confirm identical figure/rows. Run a SQL Lab query and confirm columns/rows match.

- [ ] **Step 4: Confirm backpressure + timeout**

With `WORKER_REPLICAS=1`, fire several concurrent slow queries (e.g. a large `ods.casino_bet_win` scan); confirm excess requests return the `SERVER_BUSY`/503 busy response (not an API stall), and a query exceeding `job_timeout` fails cleanly.

- [ ] **Step 5: Leave enabled + update memory**

Leave `QUERY_QUEUE_ENABLED=true` with `WORKER_REPLICAS=2` on the eval server. Update memory `deploy-eval-server` with the worker service + flag. Final commit if any server-only notes changed (none in-repo).

---

## Self-Review

**Spec coverage:**
- Worker does full job (data + figure) → Task 2 (`run_chart_pipeline_sync` builds the figure) + Task 4 (`execute_chart_task`). ✓
- RQ library → Task 1. ✓
- `submit_and_wait` blocking bridge + busy/timeout → Task 1 + Task 4. ✓
- Feature flag default off + graceful inline fallback → Task 4 dispatch. ✓
- Scope SQL Lab + charts; reports/screenshots untouched → Tasks 2/3/4 only touch those two paths. ✓
- Worker service sharing image + `./data/csv` → Task 5. ✓
- `result_ttl ~60s`, `job_timeout 300s`, `max_wait 90s` → Task 1 (`result_ttl=60`) + Task 4 (timeouts). ✓
- Error mapping via existing `_classify_error`; `SERVER_BUSY`/503 busy code → Task 4. ✓
- Testing: unit (submit_and_wait, flag) + integration (eval server) → Task 1 + Task 6. ✓
- Deployment behind flag, GHCR variant → Task 5 + Task 6. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; verification commands concrete. ✓

**Type consistency:** `run_chart_pipeline_sync` kwargs match `_run_chart_pipeline` and `execute_chart_task(**kwargs)`. `run_sql_core(connection_id, clean_sql, max_fetch)` matches `execute_sql_task` and the SQL dispatch. `submit_and_wait(func, kwargs, *, job_timeout, max_wait, queue, poll_interval)` used consistently in Tasks 1/4. Payload dict keys match `ChartExecuteResponse` fields. ✓

**Note on test coverage:** the extracted cores (`run_chart_pipeline_sync`, `run_sql_core`) require a live DB connection, so they are verified by the existing suite (no-behaviour-change) + Task 6 integration, not new unit tests — consistent with the repo's cadence (effect/IO code verified via integration + live smoke).
