# Loading Skeletons & Performance Polish — Design

## Goal

Eliminate loading jank across the entire app: skeleton placeholders on every route, content-shaped chart skeletons, viewport-gated API calls, and unified loading indicators. The result: Karta feels instant and polished.

## Current State

- Skeleton component exists (`shadcn/ui`), used on most list pages
- No `loading.tsx` files — route transitions show nothing
- Dashboard blocks all rendering until both dashboard + charts queries resolve
- Chart cards show a bare `Loader2` spinner during execution
- Chart editor opens with empty/default state, no loading indication
- All chart API calls fire immediately regardless of viewport (only Plotly render is deferred)
- Reports page uses a custom CSS spinner instead of standard Loader2
- `isFetching` (background refetch) is never surfaced in the UI

## Design

### 1. Route-level `loading.tsx`

Add Next.js `loading.tsx` files that show automatically during navigation:

- `(dashboard)/loading.tsx` — generic: header skeleton + content area
- `(dashboard)/dashboard/[slug]/loading.tsx` — title bar + 6 chart grid skeletons
- `(dashboard)/dashboard/[slug]/chart/[id]/loading.tsx` — 3-panel editor skeleton
- `(dashboard)/charts/loading.tsx` — table header + 8 row skeletons
- `(dashboard)/sql-lab/loading.tsx` — 3-panel editor skeleton (schema + SQL + results)

Each file: simple `<Skeleton>` layout, 15-20 lines.

### 2. Dashboard header renders independently

Split dashboard page rendering:
- Header (title, buttons, filter bar) renders as soon as `dashboard` query resolves
- Chart grid shows skeleton cards while `chartsLoading` is true
- Remove the combined `if (dashLoading || chartsLoading) return skeleton` gate

### 3. Content-shaped chart skeletons (`ChartSkeleton`)

New component: `frontend/src/components/charts/chart-skeleton.tsx`

Shows a skeleton matching the expected chart shape instead of a bare spinner:
- `bar`/`bar_h`/`line`/`area`/`combo`/`waterfall` — axis lines + rectangular bars/wave shape
- `pie`/`donut`/`treemap`/`funnel` — circular/block shape
- `table`/`pivot` — row skeletons with column widths
- `kpi` — large number skeleton + label skeleton
- Default — generic rectangular area with pulse animation

Used in ChartCard when `isExecuting && !result`.

### 4. Chart editor loading state

When `useChartEditor` is loading (chart/connections/datasets not yet resolved), show a 3-column skeleton layout:
- Left panel: sidebar skeleton (column list items)
- Center: canvas skeleton (chart-shaped placeholder)
- Right panel: config skeleton (form field rows)

### 5. Viewport-gated chart API calls

Move chart execution trigger from dashboard-level batch to per-card:
- Each `ChartCard` receives `autoExecute: boolean` prop
- Card uses `useInView` to detect visibility
- When `isInView && autoExecute && !result`, fires execution
- Dashboard page no longer calls `executeAllCharts()` on mount
- Pre-load margin stays at 200px for smooth scroll experience

This means a dashboard with 20 charts only fires ~4-6 API calls initially (visible ones + 200px margin), then loads more as user scrolls.

### 6. Unified spinners

Replace custom CSS spinner in Reports page with standard `Loader2` from lucide-react. Audit for any other non-standard loading indicators.

### 7. Background refetch indicator

When `isFetching && !isLoading` (TanStack Query background refresh), show a subtle indicator:
- Chart cards: thin shimmer bar at the top edge of the card
- Dashboard: thin progress indicator under the header
- Non-blocking, doesn't replace content, just a visual hint

## Files Affected

| Area | Files |
|------|-------|
| loading.tsx | 5 new files in `frontend/src/app/` route dirs |
| Dashboard page | `dashboard/[slug]/page.tsx` — split loading, remove batch execute |
| ChartSkeleton | `components/charts/chart-skeleton.tsx` (new) |
| ChartCard | `components/charts/chart-card.tsx` — skeleton, viewport execute, refetch indicator |
| Chart editor | `dashboard/[slug]/chart/[id]/page.tsx` — loading skeleton |
| Reports | `reports/page.tsx` — replace CSS spinner |
| Shared page | `shared/[token]/page.tsx` — same viewport-gated pattern |

## Non-goals

- No changes to backend/API
- No new npm dependencies
- No changes to data fetching logic in hooks (only when calls are triggered)
- No SSR changes
