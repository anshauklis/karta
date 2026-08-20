"""Worker-callable task functions. Imported by reference (api.tasks.*) by RQ
workers, and called inline by the API when the queue is disabled. Each returns a
JSON-serializable dict."""
from api.engine_specs import discover_and_register
from api.charts.router import run_chart_pipeline_sync
from api.sql_lab.router import run_sql_core

# The RQ worker process does not run the FastAPI startup, so the engine-spec
# registry would be empty there (get_spec -> None -> BaseEngineSpec). Populate it
# on import so the worker can build engines for ClickHouse/Postgres/etc.
# Idempotent: register() overwrites, harmless when the API re-imports this module.
discover_and_register()


def execute_chart_task(**kwargs) -> dict:
    return run_chart_pipeline_sync(**kwargs)


def execute_sql_task(connection_id: int, clean_sql: str, max_fetch: int) -> dict:
    return run_sql_core(connection_id, clean_sql, max_fetch)
