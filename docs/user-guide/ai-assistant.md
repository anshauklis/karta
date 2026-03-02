# AI Assistant

Karta includes an AI-powered assistant for data exploration. Bring your own API key
(OpenAI, Anthropic, or local Ollama).

## Setup

Set these environment variables in `.env`:

```bash
AI_ENABLED=true
AI_API_URL=https://api.openai.com/v1
AI_API_KEY=sk-your-key-here
AI_MODEL=gpt-4o
```

Restart services:

```bash
docker compose up --build -d
```

The AI icon appears in the header when enabled. Returns `503` if AI is not configured.

## Chat

Click the AI icon in the header to open the chat drawer. The assistant can:

- **Generate SQL** --- describe what data you need in natural language
- **Fix SQL errors** --- paste a failing query and ask the assistant to fix it
- **Suggest chart configs** --- describe a visualization and get chart type + configuration
- **Summarize data** --- ask questions about query results
- **Query semantic models** --- if the semantic layer is configured, the assistant can
  query measures and dimensions directly

The chat uses SSE streaming with function calling (max 5 tool-use iterations per message).

## AI Features in the Chart Editor

### AI Chart Builder

In the chart header, click the AI icon to describe a chart. The assistant generates both
the SQL query and chart configuration.

### Natural Language Filters

On any dashboard, use the NL filter bar to type natural language filter expressions like:

- "show last 30 days"
- "filter by region = US"
- "only orders above $1000"

The assistant parses these into structured filter objects via
`POST /api/ai/parse-filters`.

### Chart Insights

Chart cards on dashboards show statistical insight badges:

- **Trend direction** --- up/down with percentage
- **Anomaly detection** --- Z-score based
- **Period-over-period changes**

:::{tip}
Chart insights are computed by pure statistics (no LLM calls), via
`api/ai/insights.py`. They work even without AI configured.
:::

## Supported Providers

| Provider | `AI_API_URL` | Notes |
|----------|-------------|-------|
| **OpenAI** | `https://api.openai.com/v1` | Default. Models: `gpt-4o`, `gpt-4o-mini`, etc. |
| **Anthropic** | `https://api.anthropic.com/v1` | Models: `claude-sonnet-4-20250514`, etc. |
| **Ollama** | `http://host.docker.internal:11434/v1` | Local models. No API key needed. |

:::{tip}
For Ollama, use `host.docker.internal` instead of `localhost` since the API runs
inside Docker.
:::

## AI API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | {kbd}`POST` | SSE streaming chat with tool use |
| `/api/ai/generate-sql` | {kbd}`POST` | Generate SQL from natural language |
| `/api/ai/fix-sql` | {kbd}`POST` | Fix SQL errors |
| `/api/ai/suggest-chart-config` | {kbd}`POST` | Suggest chart configuration |
| `/api/ai/parse-filters` | {kbd}`POST` | Parse natural language into filter objects |
| `/api/ai/summarize` | {kbd}`POST` | Summarize query results |

All AI endpoints require authentication (`Bearer <JWT>`) and return `503 Service Unavailable`
if AI is not configured.
