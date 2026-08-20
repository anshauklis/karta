# Async Query Queue (RQ) — Design

Date: 2026-06-29
Status: Approved (design); implementation pending
Branch: audit-improvements

## Problem

Heavy SQL / chart execution currently runs inside the FastAPI process, offloaded
only via `asyncio.to_thread` (the default thread pool). A dashboard firing N chart
executions concurrently, or a few slow ad-hoc SQL Lab queries, consume the API
process's CPU/RAM (DuckDB, pandas, parquet) and can exhaust the thread pool,
degrading responsiveness for everything else (auth, light endpoints). There is no
bound on concurrency and no isolation of heavy work from the API.

## Goals

- Move heavy execution off the API process into dedicated worker processes.
- Bound concurrency (no unbounded thread-pool growth); apply backpressure.
- Keep the HTTP contract identical — **no frontend changes**.
- Safe, reversible rollout.

## Non-goals

- Async job/poll UX (job_id + client polling), cancellation, minutes-long queries.
  Chosen model is a **bounded worker pool, blocking**: the API enqueues and waits
  for the result with a timeout, returning as it does today.
- Moving reports (scheduler) or screenshots/CSV ingest onto the queue. Scope is the
  two interactive heavy paths: **SQL Lab ad-hoc queries** and **chart/dashboard
  execution** (`_execute_chart_full`).

## Decisions

- **Library: RQ.** Redis is already in the stack; RQ workers are plain synchronous
  processes, matching our sync DuckDB/pandas code. Celery is overkill for a blocking
  pool; arq's async edge is moot for sync workloads.
- **Worker does the full heavy job** (DuckDB execution *and* Plotly figure building),
  returning a JSON-serializable payload — not just the data fetch. Keeps the API as a
  thin orchestrator and avoids pickling DataFrames.
- **Feature flag `QUERY_QUEUE_ENABLED` (default off).** Off = current
  `asyncio.to_thread` path, unchanged. On = queue path. If enqueue fails (Redis/worker
  down), gracefully fall back to inline execution so the app degrades but works.

## Architecture

```
FastAPI (api)                         RQ Queue (Redis)            Worker(s)
  execute_chart / SQL Lab  --enqueue-->  "karta" queue  --pop-->  execute_*_task
        |  (blocks, polls job status, with timeout)                   | runs DuckDB
        |<-------------------- JSON payload (result_ttl ~60s) --------+ + figure build
  build ChartExecuteResponse / SQLResult
```

New `worker` service in `docker-compose.yml`: same `./api` image, command
`rq worker karta`, connected to the existing Redis (`REDIS_URL`), mounting
`./data/csv` (shared parquet cache + DuckDB). Concurrency = number of worker replicas
(configurable). Added to the GHCR compose variant too.

## Components (isolated)

- **`api/tasks.py`** — worker-callable task functions, importable by api and worker:
  - `execute_chart_task(connection_id, base_sql, chart_config, filters, user_id, ...) -> dict`
    runs `_execute_chart_full` + `build_visual_chart` + serialization; returns
    `{figure, columns, rows, row_count, pivot_*?, error?}` (JSON-serializable).
  - `execute_sql_task(connection_id, sql, limit) -> dict` runs the SQL Lab query and
    returns `{columns, rows, row_count, ...}`.
  These are extracted from the existing synchronous core (the body after the current
  `to_thread` boundary in `_run_chart_pipeline` / SQL Lab execute), so behaviour is
  identical whether run inline or on a worker. They are unit-testable directly.

- **`api/job_queue.py`** — queue plumbing + the blocking bridge:
  - `get_queue()` → RQ `Queue("karta", connection=Redis.from_url(REDIS_URL))`.
  - `submit_and_wait(task, kwargs, *, job_timeout, max_wait) -> result`:
    enqueue the task, poll `job.get_status()` until `finished` (return `job.result`),
    `failed` (re-raise the worker exception), or `max_wait` elapsed (raise a
    `QueueBusy`/timeout error). Pure-ish control flow, unit-testable with a stub queue.

- **Endpoint wiring** in `charts/router.py` and `sql_lab/router.py`: when
  `QUERY_QUEUE_ENABLED`, `await asyncio.to_thread(submit_and_wait, task, kwargs, ...)`
  (so the blocking poll doesn't block the event loop); else the current path. Response
  construction (`ChartExecuteResponse`, error classification via `_classify_error`,
  pivot fields) is unchanged and stays in the API.

## Concurrency / timeouts / backpressure

- Each RQ worker processes one job at a time → total concurrency = replicas (e.g. 4).
- Per-job timeout `JOB_TIMEOUT` = 300s (matches the existing parquet 5-min ceiling).
- If all workers are busy, jobs wait in Redis; the API blocks up to `MAX_WAIT`
  (e.g. 90s) then returns a clear "server busy, try again" error (HTTP 503 via the
  error classifier). This is the core win: bounded concurrency instead of thread-pool
  exhaustion, with heavy CPU/RAM isolated from the API.
- `result_ttl` short (~60s): the API reads the result immediately after completion.

## Error handling

- Worker exceptions are captured by RQ as failed jobs; `submit_and_wait` reconstructs
  and re-raises so the existing `_classify_error` mapping produces the same structured
  `{code, message, detail}` response the frontend already handles.
- Enqueue failure (Redis unreachable) → graceful fallback to inline execution.
- `QueueBusy` (max_wait exceeded) → a new structured error code (e.g. `SERVER_BUSY`).

## Testing

- **Unit:** `submit_and_wait` against a stub queue/job — covers finished→result,
  failed→re-raise, and max_wait→busy. `execute_chart_task` / `execute_sql_task` return
  JSON-serializable payloads (tested directly, no RQ — as the perf profiler already
  does against real CH data).
- **Integration (eval server):** enable the flag with 2–4 worker replicas; load a
  dashboard and confirm charts render via workers (worker logs show jobs); verify a
  slow query trips the timeout and that saturating workers yields the busy response,
  not API stalls.
- Flag defaults off → CI and the existing 139-test suite are unaffected.

## Deployment / rollout

1. Add `worker` service to `docker-compose.yml` and `docker-compose.ghcr.yml`.
2. Ship behind `QUERY_QUEUE_ENABLED=false` (no behaviour change).
3. On the eval server, set `QUERY_QUEUE_ENABLED=true` + worker replicas; verify; then
   leave enabled. Toggling off instantly reverts to the inline path.

## Risks

- **DataFrame/result serialization:** mitigated — chart results are aggregated-small;
  worker returns JSON (figure dict + rows), no DataFrame pickling.
- **Shared parquet cache races:** workers and api already share `./data/csv`; the
  existing per-key single-flight lock is per-process, so cold-cache stampede control
  weakens slightly across worker replicas (at most one stream per worker). Acceptable;
  noted for a future cross-process lock if needed.
- **Two code paths (inline vs queue):** kept identical by routing both through the same
  extracted task functions; the flag only chooses *where* they run.
