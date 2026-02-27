# Embedding SDK — Design

## Goal

Create a full-featured Embedding SDK (`@karta-bi/embed`) that lets developers embed Karta dashboards and individual charts into any web application. Iframe-first architecture with postMessage communication protocol, React component + vanilla JS API.

## Architecture

Iframe-first. SDK is a thin wrapper around an iframe. Communication via `postMessage`. No direct API calls from SDK — everything goes through Karta's embed pages.

```
Host App                              Karta (iframe)
┌──────────────────────┐             ┌────────────────────────┐
│ <KartaEmbed />       │ postMessage │ /embed/[token]         │
│ or                   │ ──────────► │ /embed/chart/[token]   │
│ createKartaEmbed(el) │             │                        │
│                      │             │ Commands:              │
│ Props/options:       │             │  setTheme              │
│  token, baseUrl      │             │  setFilters            │
│  theme, filters      │             │  refresh               │
│  height / autoResize │             │                        │
│                      │ ◄────────── │ Events:                │
│ Callbacks:           │ postMessage │  ready                 │
│  onReady             │             │  error                 │
│  onError             │             │  resize (contentHeight)│
│  onChartClick        │             │  chartClick            │
│  onFilterChange      │             │  filterChange          │
│  onThemeChange       │             │  themeChange           │
└──────────────────────┘             └────────────────────────┘
```

## Features

### 1. Fix Filter Bug (backend)

`get_shared_dashboard()` in `api/export/router.py` currently ignores `?filters=` query param. The frontend embed page parses `?filter_<column>=<value>` params and sends them as `?filters=JSON` to the API, but the backend never reads or applies them.

**Fix:**
- Accept `filters: str | None = Query(None)` parameter
- Parse JSON → `dict[str, str]`
- For each chart: inject filters as additional WHERE conditions during SQL execution

### 2. Chart-Level Embed

New token type for individual charts.

**Backend:**
- `shared_links` table: add `chart_id INTEGER REFERENCES charts(id)` (nullable). If `chart_id` is set — link is for a chart, otherwise for a dashboard.
- `POST /api/charts/{id}/share` — create share link for a chart
- `GET /api/shared/chart/{token}` — public endpoint, returns one chart with pre-executed data

**Frontend:**
- `/embed/chart/[token]/page.tsx` — renders a single ChartCard, no grid, minimal padding
- Supports `?theme=`, `?filter_<col>=<val>` same as dashboard embed

### 3. postMessage Protocol

Namespace: `karta:`. Format: `{ type: "karta:<name>", ...payload }`.

**Parent → iframe (commands):**

| Type | Payload | Description |
|------|---------|-------------|
| `karta:setTheme` | `{ theme: "light" \| "dark" }` | Switch theme |
| `karta:setFilters` | `{ filters: Record<string, string> }` | Re-fetch with new filters |
| `karta:refresh` | `{}` | Reload data |

**Iframe → parent (events):**

| Type | Payload | When |
|------|---------|------|
| `karta:ready` | `{ embedType: "dashboard" \| "chart", id, title, chartCount? }` | Load complete |
| `karta:error` | `{ code: string, message: string }` | Error (404, 410, network) |
| `karta:resize` | `{ height: number }` | Content height changed |
| `karta:chartClick` | `{ chartId, chartTitle, point?: { x, y, label } }` | Click on data point |
| `karta:filterChange` | `{ filters: Record<string, string> }` | Filters applied (confirmation) |
| `karta:themeChange` | `{ theme: "light" \| "dark" }` | Theme switched |

Security: iframe validates `event.origin`, SDK filters by `event.source === iframe.contentWindow`.

### 4. React Component API

```tsx
import { KartaEmbed } from "@karta-bi/embed";

// Dashboard embed
<KartaEmbed
  baseUrl="https://bi.example.com"
  token="abc123"
  theme="dark"
  filters={{ region: "EU" }}
  height={600}              // fixed height (default)
  autoResize                // OR: auto-resize to content
  className="rounded-lg"
  onReady={(e) => {}}
  onError={(e) => {}}
  onChartClick={(e) => {}}
  onFilterChange={(e) => {}}
  onThemeChange={(e) => {}}
/>

// Chart embed
<KartaEmbed
  baseUrl="https://bi.example.com"
  token="xyz789"
  type="chart"              // default "dashboard"
  theme="light"
  height={400}
/>
```

**Ref API for imperative calls:**
```tsx
const ref = useRef<KartaEmbedRef>(null);
ref.current?.setFilters({ region: "US" });
ref.current?.setTheme("light");
ref.current?.refresh();
```

### 5. Vanilla JS API

```js
import { createKartaEmbed } from "@karta-bi/embed";

const embed = createKartaEmbed(document.getElementById("bi"), {
  baseUrl: "https://bi.example.com",
  token: "abc123",
  theme: "dark",
  filters: { region: "EU" },
  autoResize: true,
  onReady: (e) => console.log("Loaded", e),
  onChartClick: (e) => console.log("Click", e),
});

// Imperative methods
embed.setFilters({ region: "US" });
embed.setTheme("light");
embed.refresh();
embed.destroy(); // cleanup
```

React component internally uses the same vanilla core — single source of logic.

### 6. Auto-Resize

- Embed page: `ResizeObserver` on container → on height change sends `karta:resize { height }`
- SDK: on receiving `karta:resize` updates `iframe.style.height`
- Enabled via `autoResize` prop/option
- With `autoResize` initial height = 200px, then updated on first `resize` event
- Throttle: max 1 event per 100ms

### 7. Package Structure

```
packages/embed-sdk/
├── package.json            # @karta-bi/embed
├── tsconfig.json
├── tsup.config.ts          # ESM + CJS + types
├── src/
│   ├── index.ts            # public exports
│   ├── core.ts             # vanilla JS core (createKartaEmbed)
│   ├── KartaEmbed.tsx      # React wrapper over core
│   ├── protocol.ts         # message type constants + helpers
│   └── types.ts            # TypeScript interfaces
└── README.md
```

## Files to Modify

### Backend
- `api/database.py` — add `chart_id` column to `shared_links`
- `api/export/router.py` — fix `filters` param in `get_shared_dashboard()`, add `POST /api/charts/{id}/share`, add `GET /api/shared/chart/{token}`

### Frontend (embed pages)
- `frontend/src/app/embed/[token]/page.tsx` — add postMessage listener/sender, ResizeObserver
- `frontend/src/app/embed/chart/[token]/page.tsx` — new page for chart embed
- `frontend/src/app/embed/chart/[token]/layout.tsx` — minimal layout (same as dashboard embed)

### Frontend (share dialog)
- `frontend/src/components/share-dialog.tsx` — chart share support (if opened from chart context)

### New package
- `packages/embed-sdk/` — entire new package

### Nginx
- `nginx.conf` — extend `/embed/` location to also cover `/embed/chart/`

## Scope Exclusions

- No SSR support (client-only component)
- No programmatic chart creation via SDK
- No authenticated embed (share tokens only)
- No Web Component (`<karta-embed>`)
- No drag-to-select/interact with dashboard layout from host
