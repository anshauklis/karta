# Q2 Design: AI Multi-Agent Copilot + Semantic Layer

**Date**: 2026-02-27
**Status**: Approved
**Scope**: AI Copilot (multi-agent architecture) + Semantic Layer (DB-stored model with measures, dimensions, joins)

---

## 1. AI Multi-Agent Copilot

### 1.1 Agent Router

New module `api/ai/agents.py`. On each user message, a lightweight LLM call classifies intent and routes to the appropriate agent.

| Agent | Triggers | Tools | Purpose |
|-------|----------|-------|---------|
| **Data Analyst** | "show me", "how many", "which region", "compare" | execute_sql, get_schema, get_sample, get_table_profile, semantic_query | Writes SQL, executes, explains results. Default agent. |
| **Chart Builder** | "build a chart", "visualize", "make a pie chart" | quick_create_chart, create_chart, update_chart, patch_chart_config, preview_chart | Creates and configures charts. |
| **Dashboard Manager** | "add to dashboard", "create dashboard", "clone" | create_dashboard, clone_dashboard, clone_chart, add_filter, list_dashboards | Manages dashboards, filters, layout. |

**Routing**: Single LLM call with function calling returns `{ agent: "data_analyst" | "chart_builder" | "dashboard_manager" }`. Data Analyst is fallback if uncertain.

**Shared state**: All agents operate within the same session (ai_sessions table). Conversation history is shared. Each agent prepends its own system prompt on top of the common base prompt.

**Handoff**: If an agent determines the request isn't for it, it can hand off to another agent (max 1 handoff per turn to prevent loops).

### 1.2 Copilot Sidebar

New component `frontend/src/components/ai/copilot-sidebar.tsx`:

- **Trigger**: Button on every dashboard/chart page (bottom-right or header)
- **UI**: `Sheet` from shadcn/ui, slides in from the right
- **Context-aware**: Passes dashboard_id / chart_id / connection_id to the chat endpoint
- **Inline rendering**: SQL results rendered as mini-tables; chart suggestions rendered as thumbnails
- **Suggested questions**: On session start, shows 3-4 contextual prompts based on current page

### 1.3 Context Enrichment

Enhanced `_load_messages_for_llm`:

- **Dashboard context**: All chart titles + SQL queries + column names for the current dashboard
- **Chart context**: Full chart_config + last execution result (top 5 rows)
- **Semantic context**: Available models, measures, dimensions from semantic layer
- **Conversation summary**: For conversations >15 messages, older messages are summarized via LLM to stay within token limits

### 1.4 Error Handling

- Agent timeout: 30s per agent response; fallback to Data Analyst
- Tool execution errors: user-friendly messages, not tracebacks
- Rate limiting: max 20 messages/minute per user
- Token budget: auto-summarize conversations exceeding ~15k tokens

---

## 2. Semantic Layer

### 2.1 Data Model

```sql
CREATE TABLE IF NOT EXISTS semantic_models (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    source_type     TEXT NOT NULL DEFAULT 'table',  -- 'table' | 'sql'
    source_table    TEXT,
    source_sql      TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, name)
);

CREATE TABLE IF NOT EXISTS model_measures (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    expression      TEXT NOT NULL,
    agg_type        TEXT NOT NULL,  -- 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max' | 'custom'
    format          TEXT DEFAULT '',
    filters         JSONB DEFAULT '[]',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(model_id, name)
);

CREATE TABLE IF NOT EXISTS model_dimensions (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    column_name     TEXT NOT NULL,
    dimension_type  TEXT NOT NULL DEFAULT 'categorical',  -- 'categorical' | 'temporal' | 'numeric'
    time_grain      TEXT,  -- 'day' | 'week' | 'month' | 'quarter' | 'year'
    format          TEXT DEFAULT '',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(model_id, name)
);

CREATE TABLE IF NOT EXISTS model_joins (
    id              SERIAL PRIMARY KEY,
    from_model_id   INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    to_model_id     INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    join_type       TEXT NOT NULL DEFAULT 'left',  -- 'inner' | 'left' | 'right' | 'full'
    from_column     TEXT NOT NULL,
    to_column       TEXT NOT NULL,
    UNIQUE(from_model_id, to_model_id)
);
```

### 2.2 API Endpoints (`api/semantic/router.py`)

```
GET    /api/semantic/models                    — list models
POST   /api/semantic/models                    — create model
GET    /api/semantic/models/{id}               — model + measures + dimensions + joins
PUT    /api/semantic/models/{id}               — update model
DELETE /api/semantic/models/{id}               — delete model

POST   /api/semantic/models/{id}/measures      — add measure
PUT    /api/semantic/measures/{id}             — update measure
DELETE /api/semantic/measures/{id}             — delete measure

POST   /api/semantic/models/{id}/dimensions    — add dimension
PUT    /api/semantic/dimensions/{id}           — update dimension
DELETE /api/semantic/dimensions/{id}           — delete dimension

POST   /api/semantic/models/{id}/joins         — add join
DELETE /api/semantic/joins/{id}                — delete join

POST   /api/semantic/query                     — execute semantic query
```

**Semantic query endpoint**: Accepts `{ model_id, measures: [...], dimensions: [...], filters: [...], order_by, limit }`. Generates SQL with correct JOINs, GROUP BY, aggregations from model definitions. Returns columnar data like chart execution.

### 2.3 Query Builder (`api/semantic/query_builder.py`)

Generates SQL from semantic model:

1. Resolve source (table or SQL subquery)
2. Build SELECT with measure expressions and dimension columns
3. Apply JOINs if measures/dimensions span multiple models
4. Add WHERE from filters
5. Add GROUP BY for all dimensions
6. Add ORDER BY and LIMIT
7. Validate generated SQL before execution

### 2.4 Validation

- **Measure expressions**: Dry-run `SELECT <expression> FROM <source> LIMIT 0` on save to validate syntax
- **Circular joins**: Check join graph for cycles before saving
- **Column existence**: Verify column_name exists in source table/query on save

---

## 3. Integration

### 3.1 Semantic Layer → AI Copilot

Flow:
1. User asks "which region brings the most revenue?"
2. Agent Router → Data Analyst
3. Data Analyst checks semantic models via `list_semantic_models` tool
4. Finds model "orders" with measure "total_revenue" and dimension "region"
5. Calls `semantic_query(model="orders", measures=["total_revenue"], dimensions=["region"])`
6. Returns result with mini-table in chat

Without semantic layer, AI falls back to raw SQL via execute_sql. Semantic layer is an accelerator, not a hard dependency.

### 3.2 Chart Editor Integration

New tab "Metrics" in chart editor sidebar:
- Shows measures/dimensions from semantic models linked to current connection
- Drag-and-drop measure → y_columns
- Drag-and-drop dimension → x_column
- SQL auto-generated from semantic model when metrics are used

### 3.3 New AI Tools

- `list_semantic_models(connection_id)` — list available models with their measures/dimensions
- `semantic_query(model_id, measures, dimensions, filters)` — execute semantic query

---

## 4. New Files

### Backend
- `api/ai/agents.py` — Agent router + agent definitions + per-agent system prompts
- `api/semantic/__init__.py`
- `api/semantic/router.py` — Semantic CRUD API
- `api/semantic/query_builder.py` — SQL generation from semantic model

### Frontend
- `frontend/src/components/ai/copilot-sidebar.tsx` — Copilot slide-over panel
- `frontend/src/components/ai/chat-message.tsx` — Enhanced message rendering (inline tables, charts)
- `frontend/src/components/ai/suggested-questions.tsx` — Contextual prompt suggestions
- `frontend/src/app/(dashboard)/metrics/page.tsx` — Metrics management page
- `frontend/src/components/metrics/model-editor.tsx` — Semantic model editor
- `frontend/src/components/metrics/measure-form.tsx` — Measure create/edit form
- `frontend/src/components/metrics/dimension-form.tsx` — Dimension create/edit form
- `frontend/src/components/metrics/join-editor.tsx` — Join relationship editor
- `frontend/src/hooks/use-semantic.ts` — TanStack Query hooks for semantic API

### Modified Files
- `api/database.py` — Add 4 new tables to SCHEMA_SQL
- `api/main.py` — Register semantic router
- `api/ai/prompts.py` — Add semantic context to system prompt
- `api/ai/tools.py` — Add list_semantic_models + semantic_query tools
- `api/ai/router.py` — Integrate agent routing, enhance _load_messages_for_llm
- `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/chart-sidebar.tsx` — Add Metrics tab
- `frontend/messages/en.json` / `ru.json` — i18n keys for semantic layer + copilot

---

## 5. Effort Estimate

| Component | Effort |
|-----------|--------|
| Agent router + agent definitions | 3-4 days |
| Copilot sidebar + inline rendering | 3-4 days |
| Context enrichment + summary | 2-3 days |
| Semantic tables + migrations | 1 day |
| Semantic CRUD API | 2-3 days |
| Semantic query builder | 3-4 days |
| Metrics management UI | 3-4 days |
| Chart editor integration | 2-3 days |
| AI tools for semantic layer | 1-2 days |
| Testing + polish | 2-3 days |
| **Total** | **~22-30 working days** |
