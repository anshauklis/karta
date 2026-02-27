# Embedding SDK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@karta-bi/embed` — a full-featured SDK for embedding Karta dashboards and charts into any web app via iframe + postMessage.

**Architecture:** Iframe-first. SDK creates an iframe pointing to `/embed/[token]` or `/embed/chart/[token]`. Communication via `postMessage` with `karta:` namespace. Vanilla JS core (`createKartaEmbed`) + React wrapper (`<KartaEmbed />`). Backend fixes: filter injection for shared endpoints, chart-level share tokens.

**Tech Stack:** TypeScript, React 18+, tsup (ESM+CJS build), postMessage API, ResizeObserver.

**Note:** This project has no test suite. Steps focus on implementation + manual/build verification.

---

## Task 1: Fix Filter Bug in Shared Dashboard Endpoint

The frontend embed page parses `?filter_<col>=<val>` and sends `?filters=JSON` to the API, but the backend `get_shared_dashboard()` ignores the `filters` query param. `_execute_chart_full()` already supports a `filters` dict — we just need to wire it through.

**Files:**
- Modify: `api/export/router.py:711-776`

**Step 1: Add `filters` query parameter to `get_shared_dashboard()`**

Change the function signature at line 712 from:

```python
def get_shared_dashboard(token: str):
```

to:

```python
def get_shared_dashboard(token: str, filters: str | None = Query(None)):
```

Add `Query` to the FastAPI imports at the top of the file (it may already be imported).

**Step 2: Parse the filters JSON and pass to `_execute_chart_full`**

After the `share_creator_id = link["created_by"]` line (~line 746), add filter parsing:

```python
        # Parse embed filters
        parsed_filters = None
        if filters:
            try:
                parsed_filters = json.loads(filters)
                if not isinstance(parsed_filters, dict):
                    parsed_filters = None
            except (json.JSONDecodeError, TypeError):
                parsed_filters = None
```

Make sure `json` is imported at the top of the file.

**Step 3: Pass `parsed_filters` to `_execute_chart_full`**

In the chart execution loop (~line 757), change:

```python
columns, rows, df, pq_path = _execute_chart_full(
    chart["connection_id"], chart["sql_query"], chart_config,
    user_id=share_creator_id)
```

to:

```python
columns, rows, df, pq_path = _execute_chart_full(
    chart["connection_id"], chart["sql_query"], chart_config,
    filters=parsed_filters,
    user_id=share_creator_id)
```

**Step 4: Verify**

```bash
docker compose up --build -d && docker compose logs -f api
```

Test: create a shared dashboard link, open `/embed/<token>?filter_<column>=<value>` — the chart data should be filtered.

**Step 5: Commit**

```bash
git add api/export/router.py
git commit -m "fix: apply URL filters in shared dashboard endpoint"
```

---

## Task 2: Chart Share Backend (Schema + Endpoints)

Add chart-level sharing: `chart_id` column on `shared_links`, create/validate/get endpoints for chart tokens.

**Files:**
- Modify: `api/database.py:255-262` — add `chart_id` column
- Modify: `api/models.py:563-573` — update Pydantic models
- Modify: `api/export/router.py` — add chart share endpoints
- Modify: `frontend/src/types/index.ts:575-582` — add `chart_id` to `SharedLink`

**Step 1: Add `chart_id` column to schema**

In `api/database.py`, after the `shared_links` CREATE TABLE block (line 262), add:

```sql
ALTER TABLE shared_links ADD COLUMN IF NOT EXISTS chart_id INTEGER REFERENCES charts(id) ON DELETE CASCADE;
ALTER TABLE shared_links ALTER COLUMN dashboard_id DROP NOT NULL;
```

Add these as new lines inside the `SCHEMA_SQL` string, after the existing `shared_links` CREATE TABLE statement.

**Step 2: Update Pydantic models**

In `api/models.py`, update `SharedLinkCreate` (line 563):

```python
class SharedLinkCreate(BaseModel):
    expires_in_hours: Optional[int] = None
    chart_id: Optional[int] = None
```

Update `SharedLinkResponse` (line 566):

```python
class SharedLinkResponse(BaseModel):
    id: int
    dashboard_id: Optional[int]
    chart_id: Optional[int] = None
    token: str
    created_by: Optional[int]
    expires_at: Optional[datetime]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

**Step 3: Add chart share endpoint — create**

In `api/export/router.py`, after `revoke_share_link` (~line 708), add:

```python
@router.post("/api/charts/{chart_id}/share", response_model=SharedLinkResponse, summary="Create chart share link")
def create_chart_share_link(chart_id: int, body: SharedLinkCreate, current_user: dict = require_role("editor", "admin")):
    """Generate a unique share token for a single chart."""
    uid = int(current_user["sub"])
    token = secrets.token_urlsafe(32)
    expires_at = None
    if body.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

    with engine.connect() as conn:
        chart = conn.execute(text("SELECT id, dashboard_id FROM charts WHERE id = :id"), {"id": chart_id}).first()
        if not chart:
            raise HTTPException(404, "Chart not found")

        row = conn.execute(text("""
            INSERT INTO shared_links (dashboard_id, chart_id, token, created_by, expires_at)
            VALUES (:did, :cid, :token, :uid, :expires)
            RETURNING *
        """), {"did": chart.dashboard_id, "cid": chart_id, "token": token, "uid": uid, "expires": expires_at})
        conn.commit()
        return dict(row.mappings().first())
```

**Step 4: Add chart share endpoint — get (public)**

After the new create endpoint, add:

```python
@router.get("/api/shared/chart/{token}", summary="Get shared chart")
def get_shared_chart(token: str, filters: str | None = Query(None)):
    """Public endpoint (no auth). Resolve a chart share token and return the chart with executed data."""
    from api.charts.router import _execute_chart_full
    from api.executor import build_visual_chart, build_pivot_table, execute_chart_code

    with engine.connect() as conn:
        link = conn.execute(text("""
            SELECT * FROM shared_links WHERE token = :token AND chart_id IS NOT NULL
        """), {"token": token}).mappings().first()

        if not link:
            raise HTTPException(404, "Share link not found")

        if link["expires_at"] and link["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(410, "Share link has expired")

        chart = conn.execute(text("""
            SELECT id, title, description, chart_type, chart_config, sql_query,
                   connection_id, mode, chart_code, created_by, created_at, updated_at
            FROM charts WHERE id = :id
        """), {"id": link["chart_id"]}).mappings().first()

        if not chart:
            raise HTTPException(404, "Chart not found")

        # Parse embed filters
        parsed_filters = None
        if filters:
            try:
                parsed_filters = json.loads(filters)
                if not isinstance(parsed_filters, dict):
                    parsed_filters = None
            except (json.JSONDecodeError, TypeError):
                parsed_filters = None

        share_creator_id = link["created_by"]
        chart_dict = dict(chart)
        result = {"figure": None, "columns": [], "rows": [], "row_count": 0, "error": None, "formatting": []}

        try:
            if chart["sql_query"] and chart["connection_id"]:
                chart_config = chart["chart_config"] or {}
                columns, rows, df, pq_path = _execute_chart_full(
                    chart["connection_id"], chart["sql_query"], chart_config,
                    filters=parsed_filters,
                    user_id=share_creator_id)
                figure = None
                if chart["mode"] == "visual" and chart["chart_type"] == "pivot":
                    pivot_result = build_pivot_table(chart_config, df)
                    result = {"figure": None, "columns": pivot_result["columns"], "rows": pivot_result["rows"][:500], "row_count": pivot_result["row_count"], "error": None, "formatting": pivot_result.get("formatting", [])}
                else:
                    if chart["mode"] == "visual":
                        figure = build_visual_chart(chart["chart_type"], chart_config, df)
                    elif chart["mode"] == "code":
                        figure = execute_chart_code(chart["chart_code"], df, parquet_path=pq_path)
                    formatting = chart_config.get("conditional_formatting", []) if chart_config else []
                    result = {"figure": figure, "columns": columns, "rows": [list(r) for r in rows[:200]], "row_count": len(rows), "error": None, "formatting": formatting}
        except Exception as e:
            result["error"] = str(e)

        chart_dict["result"] = result
        return {"chart": chart_dict}
```

**Step 5: Add chart shares list endpoint**

After the get endpoint, add:

```python
@router.get("/api/charts/{chart_id}/shares", response_model=list[SharedLinkResponse], summary="List chart share links")
def list_chart_share_links(chart_id: int, current_user: dict = Depends(get_current_user)):
    """Return all share links for a chart."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT * FROM shared_links
            WHERE chart_id = :cid
            ORDER BY created_at DESC
        """), {"cid": chart_id})
        return [dict(r) for r in rows.mappings().all()]
```

**Step 6: Update frontend SharedLink type**

In `frontend/src/types/index.ts`, update `SharedLink` (line 575):

```typescript
export interface SharedLink {
  id: number;
  dashboard_id: number | null;
  chart_id: number | null;
  token: string;
  created_by: number | null;
  expires_at: string | null;
  created_at: string;
}
```

**Step 7: Add frontend hooks for chart sharing**

In `frontend/src/hooks/use-export.ts`, after `useRevokeShareLink` (line 44), add:

```typescript
export function useChartShareLinks(chartId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["chart-share-links", chartId],
    queryFn: () => api.get<SharedLink[]>(`/api/charts/${chartId}/shares`, token),
    enabled: !!chartId && !!token,
  });
}

export function useCreateChartShareLink(chartId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { expires_in_hours?: number }) =>
      api.post<SharedLink>(`/api/charts/${chartId}/share`, body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chart-share-links", chartId] });
      toast.success("Chart share link created");
    },
    onError: () => toast.error("Failed to create chart share link"),
  });
}
```

**Step 8: Verify and commit**

```bash
docker compose up --build -d
```

```bash
git add api/database.py api/models.py api/export/router.py frontend/src/types/index.ts frontend/src/hooks/use-export.ts
git commit -m "feat: add chart-level share tokens and public endpoint"
```

---

## Task 3: Chart Embed Page (Frontend)

New `/embed/chart/[token]` page that renders a single chart without dashboard grid or chrome.

**Files:**
- Create: `frontend/src/app/embed/chart/[token]/layout.tsx`
- Create: `frontend/src/app/embed/chart/[token]/page.tsx`
- Modify: `nginx.conf` — no changes needed (existing `/embed/` location already covers `/embed/chart/`)

**Step 1: Create layout**

Create `frontend/src/app/embed/chart/[token]/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Karta - Embedded Chart",
  robots: { index: false, follow: false },
};

export default function EmbedChartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

**Step 2: Create page**

Create `frontend/src/app/embed/chart/[token]/page.tsx`:

```tsx
"use client";

import { use, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { useTheme } from "next-themes";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function EmbedChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = use(params);
  const search = use(searchParams);
  const { setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Theme from URL param
  const themeParam = (typeof search.theme === "string" ? search.theme : "light") as "light" | "dark";
  useEffect(() => { setTheme(themeParam); }, [themeParam, setTheme]);

  // Parse ?filter_<col>=<val> params
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const [key, val] of Object.entries(search)) {
      if (key.startsWith("filter_") && typeof val === "string") {
        f[key.slice(7)] = val;
      }
    }
    return f;
  }, [search]);
  const hasFilters = Object.keys(filters).length > 0;

  // Fetch chart data
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-chart", token, filters],
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/shared/chart/${token}`, window.location.origin);
      if (hasFilters) {
        url.searchParams.set("filters", JSON.stringify(filters));
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${res.status}`);
      }
      return res.json();
    },
  });

  const chart = data?.chart;

  // postMessage: send ready/error events
  useEffect(() => {
    if (chart) {
      window.parent.postMessage({
        type: "karta:ready",
        embedType: "chart",
        id: chart.id,
        title: chart.title,
      }, "*");
    }
  }, [chart]);

  useEffect(() => {
    if (error) {
      window.parent.postMessage({
        type: "karta:error",
        code: "LOAD_ERROR",
        message: (error as Error).message,
      }, "*");
    }
  }, [error]);

  // postMessage: listen for commands from parent
  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("karta:")) return;

    switch (msg.type) {
      case "karta:setTheme":
        if (msg.theme === "light" || msg.theme === "dark") setTheme(msg.theme);
        break;
      case "karta:refresh":
        window.location.reload();
        break;
    }
  }, [setTheme]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // ResizeObserver: report height changes to parent
  useEffect(() => {
    if (!containerRef.current) return;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const height = Math.ceil(entries[0].contentRect.height);
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "karta:resize", height }, "*");
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Chart click handler
  const handleChartClick = useCallback((chartId: number, data: { x?: unknown; y?: unknown; label?: string; name?: string }) => {
    window.parent.postMessage({
      type: "karta:chartClick",
      chartId,
      chartTitle: chart?.title,
      point: data,
    }, "*");
  }, [chart?.title]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (error || !chart) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm">{(error as Error)?.message || "Chart not found"}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <ChartCard
        chart={chart}
        result={chart.result}
        showActions={false}
        onDataPointClick={handleChartClick}
      />
    </div>
  );
}
```

**Step 3: Verify**

```bash
cd frontend && npm run build
```

Ensure no build errors on the new route.

**Step 4: Commit**

```bash
git add frontend/src/app/embed/chart/
git commit -m "feat: add chart-level embed page with postMessage support"
```

---

## Task 4: Add postMessage Protocol to Dashboard Embed Page

Add the same postMessage listener/sender and ResizeObserver to the existing dashboard embed page.

**Files:**
- Modify: `frontend/src/app/embed/[token]/page.tsx`

**Step 1: Add imports**

Add `useRef, useCallback` to the React import (line 3). The file already has `use, useMemo, useEffect`.

**Step 2: Add containerRef**

After the existing state variables (around line 32), add:

```typescript
const containerRef = useRef<HTMLDivElement>(null);
```

**Step 3: Add postMessage ready/error events**

After the data fetch query block (around line 67), add:

```typescript
  // postMessage: send ready event
  useEffect(() => {
    if (data?.dashboard) {
      window.parent.postMessage({
        type: "karta:ready",
        embedType: "dashboard",
        id: data.dashboard.id,
        title: data.dashboard.title,
        chartCount: data.charts?.length || 0,
      }, "*");
    }
  }, [data]);

  // postMessage: send error event
  useEffect(() => {
    if (error) {
      window.parent.postMessage({
        type: "karta:error",
        code: "LOAD_ERROR",
        message: (error as Error).message,
      }, "*");
    }
  }, [error]);
```

**Step 4: Add message listener for parent commands**

After the ready/error effects, add:

```typescript
  // postMessage: listen for commands from parent
  const [runtimeFilters, setRuntimeFilters] = useState<Record<string, string> | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("karta:")) return;

    switch (msg.type) {
      case "karta:setTheme":
        if (msg.theme === "light" || msg.theme === "dark") {
          setTheme(msg.theme);
          window.parent.postMessage({ type: "karta:themeChange", theme: msg.theme }, "*");
        }
        break;
      case "karta:setFilters":
        if (msg.filters && typeof msg.filters === "object") {
          setRuntimeFilters(msg.filters);
          window.parent.postMessage({ type: "karta:filterChange", filters: msg.filters }, "*");
        }
        break;
      case "karta:refresh":
        window.location.reload();
        break;
    }
  }, [setTheme]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);
```

Add `useState` to the React import at line 3.

**Step 5: Use `runtimeFilters` in the query**

The existing query uses `filters` from URL params. We need to merge with runtime filters from postMessage. Update the `queryKey` and the URL construction:

Change the `queryKey` line to:

```typescript
queryKey: ["shared", token, runtimeFilters || filters],
```

And the URL construction to:

```typescript
const activeFilters = runtimeFilters || filters;
const hasActiveFilters = Object.keys(activeFilters).length > 0;
const url = new URL(`${API_URL}/api/shared/${token}`, window.location.origin);
if (hasActiveFilters) {
  url.searchParams.set("filters", JSON.stringify(activeFilters));
}
```

**Step 6: Add ResizeObserver**

After the message listener effect, add:

```typescript
  // ResizeObserver: report content height to parent for auto-resize
  useEffect(() => {
    if (!containerRef.current) return;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const height = Math.ceil(entries[0].contentRect.height);
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "karta:resize", height }, "*");
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
```

**Step 7: Add chartClick handler**

Before the return statement, add:

```typescript
  const handleChartClick = useCallback((chartId: number, data: { x?: unknown; y?: unknown; label?: string; name?: string }) => {
    const chartInfo = data ? charts.find((c: any) => c.id === chartId) : null;
    window.parent.postMessage({
      type: "karta:chartClick",
      chartId,
      chartTitle: chartInfo?.title,
      point: data,
    }, "*");
  }, [data?.charts]);
```

**Step 8: Wire containerRef and chartClick into JSX**

1. Wrap the main grid container `<div className="w-full p-2">` with `ref={containerRef}`.

2. Pass `onDataPointClick={handleChartClick}` to each `<ChartCard>` in the grid map.

**Step 9: Verify and commit**

```bash
cd frontend && npm run build
```

```bash
git add frontend/src/app/embed/[token]/page.tsx
git commit -m "feat: add postMessage protocol and ResizeObserver to dashboard embed"
```

---

## Task 5: SDK Package Scaffolding

Create the `packages/embed-sdk/` directory with build tooling.

**Files:**
- Create: `packages/embed-sdk/package.json`
- Create: `packages/embed-sdk/tsconfig.json`
- Create: `packages/embed-sdk/tsup.config.ts`
- Create: `packages/embed-sdk/src/types.ts`
- Create: `packages/embed-sdk/src/protocol.ts`

**Step 1: Create package.json**

```json
{
  "name": "@karta-bi/embed",
  "version": "0.1.0",
  "description": "Embed Karta dashboards and charts into any web app",
  "license": "AGPL-3.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true }
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0"
  },
  "keywords": ["karta", "bi", "embed", "dashboard", "charts", "iframe", "analytics"],
  "repository": {
    "type": "git",
    "url": "https://github.com/anshauklis/karta",
    "directory": "packages/embed-sdk"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  treeshake: true,
  splitting: false,
});
```

**Step 4: Create src/types.ts**

```typescript
/** Theme values supported by Karta embed */
export type KartaTheme = "light" | "dark";

/** Type of embedded content */
export type KartaEmbedType = "dashboard" | "chart";

/** Options for creating a Karta embed instance */
export interface KartaEmbedOptions {
  /** Base URL of the Karta instance (e.g. "https://bi.example.com") */
  baseUrl: string;
  /** Share token for the dashboard or chart */
  token: string;
  /** Type of content to embed. Default: "dashboard" */
  type?: KartaEmbedType;
  /** Theme override. Default: "light" */
  theme?: KartaTheme;
  /** Filter values to inject. Keys are column names, values are filter values. */
  filters?: Record<string, string>;
  /** Fixed height in pixels. Ignored if autoResize is true. Default: 600 */
  height?: number;
  /** Automatically resize iframe height to match content. Default: false */
  autoResize?: boolean;
  /** Called when the embed has finished loading */
  onReady?: (event: KartaReadyEvent) => void;
  /** Called when an error occurs during loading */
  onError?: (event: KartaErrorEvent) => void;
  /** Called when a data point on a chart is clicked */
  onChartClick?: (event: KartaChartClickEvent) => void;
  /** Called when filters are applied (confirmation of setFilters) */
  onFilterChange?: (event: KartaFilterChangeEvent) => void;
  /** Called when the theme changes */
  onThemeChange?: (event: KartaThemeChangeEvent) => void;
}

/** Event fired when embed is ready */
export interface KartaReadyEvent {
  embedType: KartaEmbedType;
  id: number;
  title: string;
  chartCount?: number;
}

/** Event fired on load error */
export interface KartaErrorEvent {
  code: string;
  message: string;
}

/** Event fired on chart data point click */
export interface KartaChartClickEvent {
  chartId: number;
  chartTitle: string;
  point?: {
    x?: unknown;
    y?: unknown;
    label?: string;
    name?: string;
  };
}

/** Event fired when filters change */
export interface KartaFilterChangeEvent {
  filters: Record<string, string>;
}

/** Event fired when theme changes */
export interface KartaThemeChangeEvent {
  theme: KartaTheme;
}

/** Imperative methods available on a Karta embed instance */
export interface KartaEmbedInstance {
  /** Update the filters and re-fetch data */
  setFilters(filters: Record<string, string>): void;
  /** Switch the theme */
  setTheme(theme: KartaTheme): void;
  /** Reload the embedded content */
  refresh(): void;
  /** Remove the iframe and clean up event listeners */
  destroy(): void;
}
```

**Step 5: Create src/protocol.ts**

```typescript
/** All postMessage types used by the Karta embed protocol */
export const KARTA_MSG = {
  // Commands (parent → iframe)
  SET_THEME: "karta:setTheme",
  SET_FILTERS: "karta:setFilters",
  REFRESH: "karta:refresh",
  // Events (iframe → parent)
  READY: "karta:ready",
  ERROR: "karta:error",
  RESIZE: "karta:resize",
  CHART_CLICK: "karta:chartClick",
  FILTER_CHANGE: "karta:filterChange",
  THEME_CHANGE: "karta:themeChange",
} as const;

/** Prefix for all Karta postMessage types */
export const KARTA_PREFIX = "karta:";
```

**Step 6: Install dependencies and verify**

```bash
cd packages/embed-sdk && npm install && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add packages/embed-sdk/
git commit -m "feat: scaffold @karta-bi/embed package with types and protocol"
```

---

## Task 6: SDK Vanilla JS Core

The core `createKartaEmbed()` function that creates an iframe, manages postMessage communication, and exposes imperative methods. The React component will wrap this.

**Files:**
- Create: `packages/embed-sdk/src/core.ts`

**Step 1: Implement createKartaEmbed**

Create `packages/embed-sdk/src/core.ts`:

```typescript
import type {
  KartaEmbedOptions,
  KartaEmbedInstance,
  KartaTheme,
  KartaReadyEvent,
  KartaErrorEvent,
  KartaChartClickEvent,
  KartaFilterChangeEvent,
  KartaThemeChangeEvent,
} from "./types";
import { KARTA_MSG, KARTA_PREFIX } from "./protocol";

/**
 * Create a Karta embed instance. Inserts an iframe into the target element
 * and manages postMessage communication with the embedded content.
 */
export function createKartaEmbed(
  container: HTMLElement,
  options: KartaEmbedOptions,
): KartaEmbedInstance {
  const {
    baseUrl,
    token,
    type = "dashboard",
    theme = "light",
    filters,
    height = 600,
    autoResize = false,
    onReady,
    onError,
    onChartClick,
    onFilterChange,
    onThemeChange,
  } = options;

  // Build iframe URL
  const embedPath = type === "chart" ? `/embed/chart/${token}` : `/embed/${token}`;
  const url = new URL(embedPath, baseUrl);
  url.searchParams.set("theme", theme);
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      url.searchParams.set(`filter_${key}`, val);
    }
  }

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.src = url.toString();
  iframe.style.width = "100%";
  iframe.style.height = autoResize ? "200px" : `${height}px`;
  iframe.style.border = "none";
  iframe.setAttribute("allowfullscreen", "true");
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("title", `Karta ${type} embed`);
  container.appendChild(iframe);

  // Message handler
  function handleMessage(event: MessageEvent) {
    // Only accept messages from our iframe
    if (event.source !== iframe.contentWindow) return;
    const msg = event.data;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith(KARTA_PREFIX)) return;

    switch (msg.type) {
      case KARTA_MSG.READY:
        onReady?.({
          embedType: msg.embedType,
          id: msg.id,
          title: msg.title,
          chartCount: msg.chartCount,
        } as KartaReadyEvent);
        break;

      case KARTA_MSG.ERROR:
        onError?.({
          code: msg.code,
          message: msg.message,
        } as KartaErrorEvent);
        break;

      case KARTA_MSG.RESIZE:
        if (autoResize && typeof msg.height === "number") {
          iframe.style.height = `${msg.height}px`;
        }
        break;

      case KARTA_MSG.CHART_CLICK:
        onChartClick?.({
          chartId: msg.chartId,
          chartTitle: msg.chartTitle,
          point: msg.point,
        } as KartaChartClickEvent);
        break;

      case KARTA_MSG.FILTER_CHANGE:
        onFilterChange?.({
          filters: msg.filters,
        } as KartaFilterChangeEvent);
        break;

      case KARTA_MSG.THEME_CHANGE:
        onThemeChange?.({
          theme: msg.theme,
        } as KartaThemeChangeEvent);
        break;
    }
  }

  window.addEventListener("message", handleMessage);

  // Helper to send command to iframe
  function send(data: Record<string, unknown>) {
    iframe.contentWindow?.postMessage(data, baseUrl);
  }

  // Public API
  const instance: KartaEmbedInstance = {
    setFilters(newFilters: Record<string, string>) {
      send({ type: KARTA_MSG.SET_FILTERS, filters: newFilters });
    },
    setTheme(newTheme: KartaTheme) {
      send({ type: KARTA_MSG.SET_THEME, theme: newTheme });
    },
    refresh() {
      send({ type: KARTA_MSG.REFRESH });
    },
    destroy() {
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    },
  };

  return instance;
}
```

**Step 2: Verify**

```bash
cd packages/embed-sdk && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add packages/embed-sdk/src/core.ts
git commit -m "feat: implement createKartaEmbed vanilla JS core"
```

---

## Task 7: SDK React Component

React `<KartaEmbed />` component wrapping the vanilla core, with ref support for imperative methods.

**Files:**
- Create: `packages/embed-sdk/src/KartaEmbed.tsx`
- Create: `packages/embed-sdk/src/index.ts`

**Step 1: Create the React component**

Create `packages/embed-sdk/src/KartaEmbed.tsx`:

```tsx
import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from "react";
import { createKartaEmbed } from "./core";
import type {
  KartaEmbedOptions,
  KartaEmbedInstance,
  KartaTheme,
  KartaReadyEvent,
  KartaErrorEvent,
  KartaChartClickEvent,
  KartaFilterChangeEvent,
  KartaThemeChangeEvent,
  KartaEmbedType,
} from "./types";

/** Props for the KartaEmbed React component */
export interface KartaEmbedProps {
  /** Base URL of the Karta instance (e.g. "https://bi.example.com") */
  baseUrl: string;
  /** Share token for the dashboard or chart */
  token: string;
  /** Type of content to embed. Default: "dashboard" */
  type?: KartaEmbedType;
  /** Theme override. Default: "light" */
  theme?: KartaTheme;
  /** Filter values to inject */
  filters?: Record<string, string>;
  /** Fixed height in pixels. Ignored if autoResize is true. Default: 600 */
  height?: number;
  /** Automatically resize iframe height to match content */
  autoResize?: boolean;
  /** CSS class name for the container div */
  className?: string;
  /** Called when the embed has finished loading */
  onReady?: (event: KartaReadyEvent) => void;
  /** Called when an error occurs */
  onError?: (event: KartaErrorEvent) => void;
  /** Called when a chart data point is clicked */
  onChartClick?: (event: KartaChartClickEvent) => void;
  /** Called when filters are applied */
  onFilterChange?: (event: KartaFilterChangeEvent) => void;
  /** Called when theme changes */
  onThemeChange?: (event: KartaThemeChangeEvent) => void;
}

/** Ref handle for imperative control of the embed */
export interface KartaEmbedRef {
  setFilters(filters: Record<string, string>): void;
  setTheme(theme: KartaTheme): void;
  refresh(): void;
}

/**
 * React component for embedding Karta dashboards and charts.
 *
 * @example
 * ```tsx
 * <KartaEmbed
 *   baseUrl="https://bi.example.com"
 *   token="abc123"
 *   theme="dark"
 *   onReady={(e) => console.log("Loaded", e)}
 * />
 * ```
 */
export const KartaEmbed = forwardRef<KartaEmbedRef, KartaEmbedProps>(
  function KartaEmbed(props, ref) {
    const {
      baseUrl,
      token,
      type = "dashboard",
      theme = "light",
      filters,
      height = 600,
      autoResize = false,
      className,
      onReady,
      onError,
      onChartClick,
      onFilterChange,
      onThemeChange,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<KartaEmbedInstance | null>(null);

    // Store latest callbacks in refs to avoid re-creating the embed
    const callbacksRef = useRef({ onReady, onError, onChartClick, onFilterChange, onThemeChange });
    callbacksRef.current = { onReady, onError, onChartClick, onFilterChange, onThemeChange };

    // Create/recreate embed when key props change
    useEffect(() => {
      if (!containerRef.current) return;

      // Clean up previous instance
      instanceRef.current?.destroy();

      const instance = createKartaEmbed(containerRef.current, {
        baseUrl,
        token,
        type,
        theme,
        filters,
        height,
        autoResize,
        onReady: (e) => callbacksRef.current.onReady?.(e),
        onError: (e) => callbacksRef.current.onError?.(e),
        onChartClick: (e) => callbacksRef.current.onChartClick?.(e),
        onFilterChange: (e) => callbacksRef.current.onFilterChange?.(e),
        onThemeChange: (e) => callbacksRef.current.onThemeChange?.(e),
      });

      instanceRef.current = instance;

      return () => {
        instance.destroy();
        instanceRef.current = null;
      };
    }, [baseUrl, token, type, theme, JSON.stringify(filters), height, autoResize]);

    // Expose imperative methods via ref
    useImperativeHandle(ref, () => ({
      setFilters(newFilters: Record<string, string>) {
        instanceRef.current?.setFilters(newFilters);
      },
      setTheme(newTheme: KartaTheme) {
        instanceRef.current?.setTheme(newTheme);
      },
      refresh() {
        instanceRef.current?.refresh();
      },
    }), []);

    return <div ref={containerRef} className={className} />;
  }
);
```

**Step 2: Create index.ts exports**

Create `packages/embed-sdk/src/index.ts`:

```typescript
// Core
export { createKartaEmbed } from "./core";

// React
export { KartaEmbed } from "./KartaEmbed";
export type { KartaEmbedProps, KartaEmbedRef } from "./KartaEmbed";

// Types
export type {
  KartaTheme,
  KartaEmbedType,
  KartaEmbedOptions,
  KartaEmbedInstance,
  KartaReadyEvent,
  KartaErrorEvent,
  KartaChartClickEvent,
  KartaFilterChangeEvent,
  KartaThemeChangeEvent,
} from "./types";

// Protocol constants
export { KARTA_MSG, KARTA_PREFIX } from "./protocol";
```

**Step 3: Build the package**

```bash
cd packages/embed-sdk && npm install && npm run build
```

Verify that `dist/` contains `index.js`, `index.mjs`, `index.d.ts`.

**Step 4: Commit**

```bash
git add packages/embed-sdk/
git commit -m "feat: add KartaEmbed React component and public API exports"
```

---

## Task 8: Share Dialog — Chart Share Support

Update the share dialog to work for both dashboards and charts. When opened from a chart context, it should create chart-level share links and generate chart embed code.

**Files:**
- Modify: `frontend/src/components/share-dialog.tsx`

**Step 1: Update props to support chart context**

Change the `ShareDialogProps` interface (line 14):

```typescript
interface ShareDialogProps {
  dashboardId?: number;
  chartId?: number;
  onClose: () => void;
}
```

**Step 2: Add chart share hooks**

Import the new hooks at the top:

```typescript
import { useShareLinks, useCreateShareLink, useRevokeShareLink, useChartShareLinks, useCreateChartShareLink } from "@/hooks/use-export";
```

**Step 3: Use conditional hooks based on context**

Replace the existing hook calls (lines 22-24) with:

```typescript
  const entityType = chartId ? "chart" : "dashboard";
  const entityId = chartId || dashboardId;

  const { data: dashLinks, isLoading: isDashLoading } = useShareLinks(dashboardId);
  const { data: chartLinks, isLoading: isChartLoading } = useChartShareLinks(chartId);

  const links = chartId ? chartLinks : dashLinks;
  const isLoading = chartId ? isChartLoading : isDashLoading;

  const createDashLink = useCreateShareLink(dashboardId);
  const createChartLink = useCreateChartShareLink(chartId);
  const revokeLink = useRevokeShareLink(dashboardId);

  const createLink = chartId ? createChartLink : createDashLink;
```

**Step 4: Update embed code generation**

Change `getEmbedCode` (line 48) to generate the correct embed URL based on context:

```typescript
  const getEmbedCode = (token: string) => {
    const path = chartId ? `/embed/chart/${token}` : `/embed/${token}`;
    const src = `${window.location.origin}${path}?theme=${embedTheme}`;
    return `<iframe src="${src}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
  };
```

**Step 5: Update dialog title**

Update the `DialogTitle` to reflect the context:

```typescript
<DialogTitle>{chartId ? t("shareChart") : t("shareDashboard")}</DialogTitle>
```

Add i18n keys for `shareChart` to both `frontend/messages/en.json` and `frontend/messages/ru.json` under the `share` namespace:

```json
"shareChart": "Share Chart"
```

```json
"shareChart": "Поделиться графиком"
```

**Step 6: Verify and commit**

```bash
cd frontend && npm run build
```

```bash
git add frontend/src/components/share-dialog.tsx frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: support chart sharing in share dialog"
```

---

## Task 9: SDK README

Write clear documentation for the npm package.

**Files:**
- Create: `packages/embed-sdk/README.md`

**Step 1: Write README.md**

Create `packages/embed-sdk/README.md`:

````markdown
# @karta-bi/embed

Embed [Karta](https://github.com/anshauklis/karta) dashboards and charts into any web application.

## Installation

```bash
npm install @karta-bi/embed
```

## Quick Start (React)

```tsx
import { KartaEmbed } from "@karta-bi/embed";

function App() {
  return (
    <KartaEmbed
      baseUrl="https://bi.example.com"
      token="your-share-token"
      theme="dark"
      height={600}
      onReady={(e) => console.log("Loaded:", e.title)}
    />
  );
}
```

## Quick Start (Vanilla JS)

```js
import { createKartaEmbed } from "@karta-bi/embed";

const embed = createKartaEmbed(document.getElementById("dashboard"), {
  baseUrl: "https://bi.example.com",
  token: "your-share-token",
  theme: "dark",
  autoResize: true,
  onReady: (e) => console.log("Loaded:", e.title),
  onChartClick: (e) => console.log("Clicked:", e.chartTitle, e.point),
});

// Update at runtime
embed.setFilters({ region: "EU" });
embed.setTheme("light");
embed.refresh();

// Clean up
embed.destroy();
```

## Props / Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | required | Base URL of your Karta instance |
| `token` | `string` | required | Share token (from Share dialog) |
| `type` | `"dashboard" \| "chart"` | `"dashboard"` | What to embed |
| `theme` | `"light" \| "dark"` | `"light"` | Color theme |
| `filters` | `Record<string, string>` | — | Initial filter values |
| `height` | `number` | `600` | Iframe height in px (ignored with `autoResize`) |
| `autoResize` | `boolean` | `false` | Auto-adjust height to content |
| `className` | `string` | — | CSS class for container (React only) |

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `onReady` | `{ embedType, id, title, chartCount? }` | Embed finished loading |
| `onError` | `{ code, message }` | Load error |
| `onChartClick` | `{ chartId, chartTitle, point? }` | Data point clicked |
| `onFilterChange` | `{ filters }` | Filters applied |
| `onThemeChange` | `{ theme }` | Theme changed |

## Imperative API (React)

```tsx
import { useRef } from "react";
import { KartaEmbed, type KartaEmbedRef } from "@karta-bi/embed";

function App() {
  const ref = useRef<KartaEmbedRef>(null);

  return (
    <>
      <KartaEmbed ref={ref} baseUrl="..." token="..." />
      <button onClick={() => ref.current?.setFilters({ year: "2025" })}>
        Filter 2025
      </button>
      <button onClick={() => ref.current?.refresh()}>Refresh</button>
    </>
  );
}
```

## Embed a Single Chart

```tsx
<KartaEmbed
  baseUrl="https://bi.example.com"
  token="chart-share-token"
  type="chart"
  height={400}
/>
```

## How It Works

The SDK creates an iframe pointing to your Karta instance's embed URL (`/embed/[token]` or `/embed/chart/[token]`). Communication between your app and the iframe uses the browser's `postMessage` API with the `karta:` namespace.

No API keys or credentials are needed — embed tokens are created via Karta's Share dialog and control access.

## License

AGPL-3.0
````

**Step 2: Commit**

```bash
git add packages/embed-sdk/README.md
git commit -m "docs: add @karta-bi/embed README with usage examples"
```

---

## Task 10: Build Verification

Verify everything builds and deploys correctly.

**Step 1: Build SDK**

```bash
cd packages/embed-sdk && npm run build
```

Expected: `dist/` contains `index.js`, `index.mjs`, `index.d.ts`, `index.d.mts`.

**Step 2: Build frontend**

```bash
cd frontend && npm run build
```

Expected: Build succeeds, new routes `/embed/chart/[token]` appear in output.

**Step 3: Full stack deploy**

```bash
docker compose up --build -d
```

Expected: All 5 services healthy (postgres, api, frontend, nginx, redis).

**Step 4: Verify API schema migration**

```bash
docker compose logs api 2>&1 | head -30
```

Expected: No errors about `chart_id` column. The `ALTER TABLE shared_links ADD COLUMN IF NOT EXISTS chart_id` should execute without issues.

**Step 5: Commit any fixes**

If any build issues are found, fix and commit.

---

## Implementation Order & Dependencies

| Task | Depends On | Description |
|------|-----------|-------------|
| 1 | — | Fix filter bug in shared endpoint |
| 2 | — | Chart share backend (schema + endpoints) |
| 3 | 2 | Chart embed page |
| 4 | 1 | Dashboard embed postMessage |
| 5 | — | SDK package scaffolding |
| 6 | 5 | SDK vanilla JS core |
| 7 | 6 | SDK React component |
| 8 | 2 | Share dialog chart support |
| 9 | 7 | SDK README |
| 10 | all | Build verification |

Tasks 1, 2, and 5 can run in parallel.
Tasks 3 and 4 can run in parallel (after their deps).
Tasks 6→7→9 are sequential.
