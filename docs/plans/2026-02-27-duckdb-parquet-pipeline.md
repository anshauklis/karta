# DuckDB + Parquet: полный перевод chart execution engine

## Контекст

Текущий pipeline чартов загружает ВСЕ данные из внешней БД в pandas DataFrame, потом применяет 6 трансформаций в Python. При 40M строк × 20 колонок = OOM (API контейнер 1GB). Цель: заменить на streaming fetch → Parquet кэш на диске → DuckDB выполняет весь pipeline как SQL. Code mode получает `con` (DuckDB connection) для SQL на сырых данных.

## Архитектура

```
НОВЫЙ FLOW:
  External DB → stream → Parquet файл (кэш, 1 на base_sql)
                              ↓
  DuckDB SQL на Parquet: RLS → dashboard filters → chart filters →
    time_range → time_grain → calculated_columns → metrics → row_limit
                              ↓
  Маленький DataFrame → Plotly / Pivot / Code mode (df + con)
```

**Три пути:**

| Source | Кэш? | Engine |
|--------|-------|--------|
| DuckDB connection (uploaded files) | Нет — прямой запрос | DuckDB на source таблицах |
| External DB, cache hit | Parquet на диске | DuckDB на Parquet |
| External DB, cache miss | Stream → Parquet | DuckDB на Parquet |

**Кэш на уровне base SQL** — один Parquet на `(connection_id, base_sql)`, общий для всех пользователей. RLS/фильтры применяются DuckDB при каждом запросе.

---

## Файлы

| Файл | Действие |
|------|----------|
| `api/pyproject.toml` | Добавить `pyarrow>=14.0.0` |
| `api/parquet_cache.py` | **Новый** — streaming fetch, кэш, cleanup |
| `api/pipeline_sql.py` | **Новый** — генерация pipeline SQL из chart config |
| `api/charts/router.py` | Рефакторинг `_execute_chart_sql`, замена `_apply_pipeline` |
| `api/executor.py` | Добавить `con` в code mode subprocess |
| `api/alerts/executor.py` | Обновить вызов `_execute_chart_sql` |
| `api/reports/executor.py` | Обновить вызов `_execute_chart_sql` |
| `api/export/router.py` | Обновить вызов в `get_shared_dashboard` |
| `api/connections/router.py` | Добавить cache invalidation при update/delete connection |
| `api/scheduler.py` | Добавить cleanup job для expired Parquet |
| `docker-compose.yml` | Убедиться что `./data/csv` volume mount покрывает `parquet_cache/` |

---

## Шаг 1: Зависимости и инфраструктура

**`api/pyproject.toml`**: добавить `pyarrow>=14.0.0`

**Директория кэша**: `data/csv/parquet_cache/` (внутри существующего Docker volume `./data/csv:/app/data/csv`). Создаётся автоматически при первом использовании.

---

## Шаг 2: `api/parquet_cache.py` — Parquet кэш

### API модуля

```python
PARQUET_CACHE_DIR = "data/csv/parquet_cache"
PARQUET_CACHE_TTL = int(os.environ.get("PARQUET_CACHE_TTL", "3600"))  # 1 час

def cache_key(connection_id: int, base_sql: str) -> str
    # sha256(f"{connection_id}:{sql}")[:24]

def parquet_path(key: str) -> str
    # PARQUET_CACHE_DIR/{key}.parquet

def get_or_populate(connection_id, base_sql, db_type, engine, ttl=None) -> (path, columns)
    # Если DuckDB → return (None, [])  # сигнал: прямой доступ
    # Если cache hit (файл + mtime < ttl) → return существующий
    # Иначе: stream fetch → write Parquet → return новый

def invalidate_connection(connection_id: int)
    # Удалить все Parquet для этого connection (при edit/delete connection)

def cleanup_expired()
    # Удалить файлы старше 2x TTL (для APScheduler)
```

### Streaming fetch

```python
def _stream_to_parquet(engine, sql, params, dest_path, db_type):
    # PostgreSQL: execution_options(stream_results=True), result.partitions(50_000)
    # MySQL/MSSQL/ClickHouse: result.fetchmany(50_000)
    # Каждый batch → pa.table(batch_dict) → pq.ParquetWriter.write_table()
    # Atomic write: пишем в .tmp, потом os.replace()
```

**Memory per batch**: 50K строк × 20 колонок × 8 bytes ≈ 8 MB. Никогда не грузим весь датасет.

### Metadata sidecar

`{key}.meta.json` рядом с каждым Parquet:
```json
{"created_at": 1709000000, "columns": ["col1", "col2"], "connection_id": 5}
```

---

## Шаг 3: `api/pipeline_sql.py` — Pipeline как SQL

### Основная функция

```python
def build_pipeline_sql(
    source: str,           # "read_parquet('/path')" или "(SELECT * FROM table)"
    config: dict,          # chart_config
    rls_conditions: list,  # ["\"region\" IN ($rls_0, $rls_1)"]
    rls_params: dict,
    dash_where: str,       # dashboard filter WHERE
    dash_params: dict,
    column_meta: dict,     # {"col": "numeric"|"text"|"timestamp"} из Parquet schema
    skip_metrics: bool = False,
) -> (sql: str, params: dict)
```

### Генерируемый SQL (CTE chain)

```sql
WITH _base AS (
    SELECT * FROM read_parquet('/app/data/csv/parquet_cache/abc123.parquet')
),
_rls AS (
    SELECT * FROM _base WHERE "tenant" IN ($rls_0, $rls_1)
),
_dash AS (
    SELECT * FROM _rls WHERE "status" = $f_0
),
_cf AS (
    SELECT * FROM _dash WHERE "amount" > $cf_0
),
_tr AS (
    SELECT * FROM _cf
    WHERE "date" >= (SELECT MAX("date") - INTERVAL '30 days' FROM _cf)
),
_tg AS (
    SELECT date_trunc('month', "date") AS "date", "category",
           SUM("amount") AS "amount", ANY_VALUE("name") AS "name"
    FROM _tr GROUP BY 1, 2 ORDER BY 1
),
_calc AS (
    SELECT *, ("amount" / "quantity") AS "unit_price" FROM _tg
),
_met AS (
    SELECT "category", SUM("unit_price") AS "Total"
    FROM _calc GROUP BY "category"
)
SELECT * FROM _met LIMIT 100
```

### CTE builders (internal)

```python
def _time_range_cte(config, prev) -> str | None
    # WHERE col >= (SELECT MAX(col) - INTERVAL 'N days' FROM prev)
    # DuckDB syntax единый для всех (в отличие от текущего per-DB)

def _time_grain_cte(config, prev, column_meta) -> str | None
    # date_trunc(grain, col) + GROUP BY + SUM(numeric) / ANY_VALUE(text)
    # column_meta определяет какие колонки SUM vs ANY_VALUE

def _chart_filters_cte(config, prev) -> (str, dict) | None
    # Все операторы: =, !=, >, IN, LIKE, IS NULL, IS NOT NULL
    # custom_sql выражения → напрямую в WHERE (DuckDB поддерживает)

def _calculated_columns_cte(config, prev) -> str | None
    # SELECT *, (expr) AS "name" — с той же regex-валидацией что сейчас

def _metrics_cte(config, prev) -> str | None
    # GROUP BY x_column, color_column + SUM/AVG/COUNT/MIN/MAX/COUNT_DISTINCT
    # custom_sql metrics пропускаются (обработаны _build_custom_sql_query)

def _row_limit(config, prev) -> str | None
    # LIMIT N
```

### Column metadata

Для `_time_grain_cte` нужны типы колонок (SUM для numeric, ANY_VALUE для text). Источники:

- **Parquet**: `pyarrow.parquet.read_schema(path)` — быстро, читает только footer
- **DuckDB**: `DESCRIBE SELECT * FROM table LIMIT 0` → column types

Функция:
```python
def get_column_meta(parquet_path: str = None, duckdb_con=None, sql: str = None) -> dict
    # Returns {"col1": "numeric", "col2": "text", "col3": "timestamp"}
```

---

## Шаг 4: Рефакторинг `api/charts/router.py`

### Новый `_execute_chart_full`

Заменяет связку `_execute_chart_sql` + `_apply_pipeline`. Одна функция делает всё:

```python
def _execute_chart_full(
    connection_id: int,
    base_sql: str,           # Базовый SQL (без custom_sql wrapping)
    chart_config: dict,
    filters: dict | None,    # Dashboard runtime filters
    user_id: int | None,
    skip_metrics: bool = False,
) -> (columns, rows, df, parquet_path):
```

**Внутри:**

1. `c = _get_connection_with_password(connection_id)`
2. `validate_sql(base_sql)`
3. **Parquet cache** (для external DB):
   ```python
   pq_path, _ = parquet_cache.get_or_populate(connection_id, base_sql, c["db_type"], engine)
   ```
4. **Column metadata**:
   ```python
   col_meta = pipeline_sql.get_column_meta(parquet_path=pq_path)
   ```
5. **Build RLS conditions** (переиспользуем существующий `get_rls_filters`):
   ```python
   rls_conds, rls_params = _build_rls_sql(connection_id, user_id)
   ```
6. **Build dashboard filter WHERE** (переиспользуем существующую логику):
   ```python
   dash_where, dash_params = _build_dashboard_filter_sql(filters)
   ```
7. **Build pipeline SQL**:
   ```python
   sql, params = pipeline_sql.build_pipeline_sql(
       source=f"read_parquet('{pq_path}')",
       config=chart_config, rls_conditions=rls_conds, ...
   )
   ```
8. **Execute via DuckDB**:
   ```python
   con = duckdb.connect()  # in-memory
   df = con.execute(sql, params).fetchdf()
   ```
9. **Return** `(columns, rows, df, pq_path)`

### DuckDB fast path

Для DuckDB connections (uploaded files) пропускаем Parquet кэш:
```python
if c["db_type"] == "duckdb":
    source = f"({base_sql})"
    con = duckdb.connect(c["database_name"], read_only=True)
    # ... build pipeline SQL with this source, execute, close
```

### Custom SQL и Pivot wrapping

Сейчас `_build_custom_sql_query` и `_build_pivot_custom_sql_query` оборачивают SQL **до** выполнения. В новой архитектуре два варианта:

**Вариант A** (проще, рекомендуемый): оставить wrapping как есть — обёрнутый SQL становится `base_sql` для Parquet кэша. Это значит кэш включает агрегацию.

**Вариант B** (эффективнее): вынести wrapping в pipeline SQL. Но это потребует парсинг custom SQL expressions → DuckDB SQL.

**Решение**: Вариант A для первой итерации. Custom SQL wrapping остаётся before cache — кэшируется уже агрегированный результат. Это safe и не требует переписывания wrapping логики.

### Замена вызовов `_apply_pipeline`

В `execute_chart`, `preview_chart`, `chart_thumbnail` заменяем:
```python
# БЫЛО:
columns, rows, df = _execute_chart_sql(connection_id, sql_query, filters, uid, ...)
df = _apply_pipeline(df, chart_config, skip_metrics=skip_metrics)

# СТАЛО:
columns, rows, df, pq_path = _execute_chart_full(
    connection_id, sql_query, chart_config, filters, uid, skip_metrics
)
```

### Сохранение `_execute_chart_sql` для обратной совместимости

`_execute_chart_sql` остаётся как обёртка для простых вызовов (alerts, reports — без pipeline):
```python
def _execute_chart_sql(connection_id, sql_query, filters=None, user_id=None):
    # Простой fetch → Parquet cache → DuckDB scan → return (columns, rows, df)
    # Без pipeline (filters/time_range/metrics)
```

---

## Шаг 5: Code mode — `api/executor.py`

### Изменения в `_code_runner`

Добавляем `parquet_path` как аргумент subprocess:

```python
def _code_runner(code, df_data, result_queue, parquet_path=None):
    # ... existing setup ...

    # Создаём DuckDB connection если есть parquet_path
    _con = None
    if parquet_path:
        import duckdb as _duckdb
        _con = _duckdb.connect()  # in-memory
        _con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{parquet_path}')")

    _rg = {
        "__builtins__": _safe,
        "df": _df,
        "pd": _pd, "px": _px, "go": _go, "np": _np,
        "make_subplots": _ms,
        "con": _con,  # NEW: DuckDB connection (or None)
    }
```

### Изменения в `execute_chart_code`

```python
def execute_chart_code(code, df, parquet_path=None):
    # ... existing validation ...
    proc = multiprocessing.Process(
        target=_code_runner,
        args=(code, df_data, result_queue, parquet_path)  # добавляем parquet_path
    )
```

### Безопасность

1. `duckdb` добавить в `_ok_modules`
2. `read_parquet` уже в `_DANGEROUS_CALL_PATTERNS` — пользователь не сможет читать другие файлы
3. Добавить в `_DANGEROUS_CALL_PATTERNS`: `"read_text"`, `"read_blob"`, `"ATTACH"`, `"INSTALL"`, `"LOAD"`
4. DuckDB connection — in-memory, view `data` → безопасный доступ только к кэшированным данным
5. `read_only` не нужен для in-memory (нет файла для записи)

### Пользовательский код

```python
# Вариант 1: чистый SQL на сырых данных (40M строк, без OOM)
result = con.sql("SELECT user_id, COUNT(*) as events FROM data GROUP BY 1").df()
fig = px.histogram(result, x='events')

# Вариант 2: SQL для тяжёлого, pandas для лёгкого
events = con.sql("SELECT user_id, COUNT(*) as cnt FROM data WHERE country='US' GROUP BY 1").df()
events['tier'] = events['cnt'].apply(lambda x: 'power' if x > 100 else 'casual')
fig = px.pie(events, names='tier')

# Вариант 3: pandas как раньше (df = маленький, после pipeline)
fig = px.bar(df, x='category', y='total')
```

---

## Шаг 6: Обновление вторичных вызовов

### `api/alerts/executor.py`
Вызывает `_execute_chart_sql(connection_id, sql)` без pipeline. Оставляем простой вызов — Parquet cache ускоряет повторные проверки.

### `api/reports/executor.py`
Аналогично — `_execute_chart_sql` возвращает DataFrame для Excel экспорта.

### `api/export/router.py` (`get_shared_dashboard`)
Заменяем на `_execute_chart_full` — полный pipeline нужен для рендеринга чартов.

### `api/connections/router.py`
При update/delete connection вызываем `parquet_cache.invalidate_connection(connection_id)`.

---

## Шаг 7: Cache management

### `api/scheduler.py`
Добавить cleanup job:
```python
scheduler.add_job(
    parquet_cache.cleanup_expired,
    trigger="interval", hours=1,
    id="parquet_cache_cleanup", replace_existing=True,
)
```

### Invalidation triggers
- Connection update/delete → `invalidate_connection(connection_id)`
- Manual refresh (force param in execute endpoint) → `invalidate(connection_id, base_sql)`

---

## Порядок реализации

| # | Шаг | Риск | Зависимости |
|---|-----|------|-------------|
| 1 | pyarrow dependency + directory | Нулевой | — |
| 2 | `parquet_cache.py` (streaming + cache) | Низкий | Шаг 1 |
| 3 | `pipeline_sql.py` (SQL generation) | Средний | — |
| 4 | Рефакторинг `charts/router.py` | Высокий | Шаги 2, 3 |
| 5 | Code mode `con` variable | Средний | Шаг 4 |
| 6 | Вторичные вызовы + cache invalidation | Низкий | Шаг 4 |
| 7 | Scheduler cleanup | Низкий | Шаг 2 |

Шаги 2 и 3 можно делать параллельно. Шаг 4 — основной и самый большой.

---

## Проверка

1. `docker compose up --build -d` — все сервисы стартуют
2. Открыть дашборд — все чарты рендерятся как раньше
3. Проверить `data/csv/parquet_cache/` — появились .parquet файлы
4. Проверить чарт с chart_filters → фильтры работают
5. Проверить чарт с time_range 30d → данные ограничены
6. Проверить чарт с metrics → агрегация корректна
7. Проверить чарт с time_grain month → данные группируются
8. Проверить code mode чарт → `df` и `con` доступны
9. Code mode: `con.sql("SELECT COUNT(*) FROM data").df()` → возвращает число
10. `docker compose logs -f api` — нет ошибок
11. Повторный запуск чарта — использует cache (нет повторного fetch из внешней БД)
12. Alerts и reports — работают без изменений
