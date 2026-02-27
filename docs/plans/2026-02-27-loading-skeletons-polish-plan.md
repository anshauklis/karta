# Loading Skeletons & Performance Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all loading jank — skeleton placeholders on every route, content-shaped chart skeletons, viewport-gated API calls, and unified loading indicators.

**Architecture:** Pure frontend changes. No backend/API modifications. Uses existing shadcn/ui `<Skeleton>` component (13 lines, `bg-accent animate-pulse rounded-md`). Leverages Next.js App Router `loading.tsx` convention and existing `useInView` hook.

**Tech Stack:** Next.js 16 App Router, React 19, shadcn/ui Skeleton, TanStack Query 5, lucide-react Loader2

---

## Task 1: Route-level `loading.tsx` Files

**Goal:** Add Next.js `loading.tsx` files so route transitions show instant skeleton layouts instead of blank screens.

**Files:**
- Create: `frontend/src/app/(dashboard)/loading.tsx`
- Create: `frontend/src/app/(dashboard)/dashboard/[slug]/loading.tsx`
- Create: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/loading.tsx`
- Create: `frontend/src/app/(dashboard)/charts/loading.tsx`
- Create: `frontend/src/app/(dashboard)/sql-lab/loading.tsx`

**Context:** The existing `<Skeleton>` component is at `frontend/src/components/ui/skeleton.tsx`. Import as `import { Skeleton } from "@/components/ui/skeleton"`. It accepts `className` for sizing.

### Step 1: Create generic dashboard layout loading

`frontend/src/app/(dashboard)/loading.tsx` — generic fallback for all `(dashboard)` routes:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

### Step 2: Create dashboard view loading

`frontend/src/app/(dashboard)/dashboard/[slug]/loading.tsx` — mimics dashboard header + chart grid:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      {/* Chart grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

### Step 3: Create chart editor loading

`frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/loading.tsx` — 3-panel skeleton:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Skeleton className="h-6 w-48" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-64 border-r p-3 space-y-2">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        {/* Center canvas */}
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        {/* Right config */}
        <div className="w-80 border-l p-3 space-y-3">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Create charts list loading

`frontend/src/app/(dashboard)/charts/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
```

### Step 5: Create SQL Lab loading

`frontend/src/app/(dashboard)/sql-lab/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Schema browser */}
      <div className="w-64 border-r p-3 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-48" />
        ))}
      </div>
      {/* Editor + results */}
      <div className="flex flex-1 flex-col">
        <Skeleton className="h-1/2 w-full" />
        <div className="border-t p-3 space-y-2 flex-1">
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 6: Commit

```bash
git add frontend/src/app/\(dashboard\)/loading.tsx \
  frontend/src/app/\(dashboard\)/dashboard/\[slug\]/loading.tsx \
  frontend/src/app/\(dashboard\)/dashboard/\[slug\]/chart/\[id\]/loading.tsx \
  frontend/src/app/\(dashboard\)/charts/loading.tsx \
  frontend/src/app/\(dashboard\)/sql-lab/loading.tsx
git commit -m "feat: add route-level loading.tsx skeletons for all major pages"
```

---

## Task 2: ChartSkeleton Component

**Goal:** Content-shaped skeleton matching chart type instead of bare Loader2 spinner.

**Files:**
- Create: `frontend/src/components/charts/chart-skeleton.tsx`

### Step 1: Create ChartSkeleton

```tsx
import { Skeleton } from "@/components/ui/skeleton";

interface ChartSkeletonProps {
  chartType?: string;
}

export function ChartSkeleton({ chartType }: ChartSkeletonProps) {
  if (chartType === "kpi") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  if (chartType === "table" || chartType === "pivot") {
    return (
      <div className="flex h-full flex-col gap-1.5 p-2">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut" || chartType === "treemap") {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-3/4 w-3/4 rounded-full aspect-square" />
      </div>
    );
  }

  // Default: bar/line/area/combo/scatter/etc — axis + bars shape
  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex flex-1 items-end gap-1.5 pb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
    </div>
  );
}
```

### Step 2: Commit

```bash
git add frontend/src/components/charts/chart-skeleton.tsx
git commit -m "feat: add ChartSkeleton component with type-aware shapes"
```

---

## Task 3: ChartCard — Skeleton + Background Refetch Indicator

**Goal:** Replace bare Loader2 spinner with ChartSkeleton. Add subtle top-bar shimmer for background refetches.

**Files:**
- Modify: `frontend/src/components/charts/chart-card.tsx`

**Context:** The loading state is at lines 256-261. The component receives `isExecuting` and `result` props. The `isInView` hook is at line 63.

### Step 1: Add ChartSkeleton import and isFetching prop

Add `isFetching?: boolean` to the `ChartCardProps` interface (line 33-48). Import `ChartSkeleton` at the top.

### Step 2: Replace Loader2 spinner with ChartSkeleton

At lines 257-260, replace:
```tsx
{!isInView || (isExecuting && !result) ? (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
```

With:
```tsx
{!isInView || (isExecuting && !result) ? (
  <ChartSkeleton chartType={chart.chart_type} />
```

### Step 3: Add background refetch indicator

Inside the Card component (after the header, before the chart body area), add a thin shimmer bar that shows when `isFetching && !isExecuting`:

```tsx
{isFetching && !isExecuting && (
  <div className="h-0.5 w-full overflow-hidden">
    <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-primary/30 rounded" />
  </div>
)}
```

Add the shimmer keyframe to the component or to `globals.css`:
```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

### Step 4: Commit

```bash
git add frontend/src/components/charts/chart-card.tsx frontend/src/app/globals.css
git commit -m "feat: chart card content skeleton and background refetch indicator"
```

---

## Task 4: Dashboard Page — Independent Header + Viewport-Gated Execution

**Goal:** (a) Render dashboard header immediately when dashboard loads (don't wait for charts). (b) Move chart execution from batch-on-mount to per-card-on-viewport.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/page.tsx`

**Context:**
- Loading gate: lines 325-336 blocks ALL rendering until both queries resolve
- Batch execution useEffect: lines 213-251
- `CHART_CONCURRENCY = 3` at line 49
- `executeChartById` at line 253
- ReactGridLayout at lines 558-602
- MobileDashboard at lines 538-554

### Step 1: Split loading gate

Replace the combined loading gate (lines 325-336) with two stages:

```tsx
// Stage 1: dashboard metadata still loading — show full skeleton
if (dashLoading) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

Remove `chartsLoading` from the gate. The header and filter bar will render as soon as `dashboard` loads. Chart grid shows skeletons via ChartCard's own loading state.

### Step 2: Convert batch execution to per-card execution

Remove the batch execution `useEffect` (lines 213-251) and the `CHART_CONCURRENCY` constant. Instead, add an `onVisible` callback pattern:

Add a new function in the page:
```tsx
const executeChartOnVisible = useCallback((chartId: number) => {
  if (executedRef.current.has(chartId)) return;
  executedRef.current.add(chartId);
  executeChartById(chartId);
}, [executeChartById]);
```

### Step 3: Pass `onVisible` to ChartCard

Add `onVisible?: () => void` prop to ChartCard. Inside ChartCard, when `isInView` becomes true and `onVisible` exists, call it:

```tsx
useEffect(() => {
  if (isInView && onVisible) onVisible();
}, [isInView, onVisible]);
```

In dashboard page, pass the callback:
```tsx
<ChartCard
  chart={chart}
  result={results[chart.id]}
  isExecuting={executing[chart.id]}
  onVisible={() => executeChartOnVisible(chart.id)}
  ...
/>
```

### Step 4: Pass `isFetching` to ChartCard

Pass `isFetching={!!executing[chart.id] && !!results[chart.id]}` — shows the shimmer bar when re-executing a chart that already has data.

### Step 5: Apply same pattern to MobileDashboard

In `frontend/src/components/dashboard/mobile-dashboard.tsx`, accept and forward `onVisible` prop to each ChartCard.

### Step 6: Apply same pattern to shared page

In `frontend/src/app/(dashboard)/shared/[token]/page.tsx`, apply the same viewport-gated execution pattern. The shared page also has batch execution that should be converted.

### Step 7: Commit

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/page.tsx \
  frontend/src/components/charts/chart-card.tsx \
  frontend/src/components/dashboard/mobile-dashboard.tsx \
  frontend/src/app/\(dashboard\)/shared/\[token\]/page.tsx
git commit -m "feat: viewport-gated chart execution and independent dashboard header"
```

---

## Task 5: Chart Editor Loading State

**Goal:** Show a 3-panel skeleton while chart editor data loads.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx`

**Context:** `useChartEditor` is called at line 147. The hook returns `isLoading` or the data objects will be undefined while loading. The 3-panel layout starts at line 563.

### Step 1: Add loading gate before the main layout

After the `useChartEditor` call and destructuring, add a loading check. Look for signals that data isn't ready yet (e.g., `!chart && !editor.isNew` or `editor.isLoading`). Show the same 3-panel skeleton used in `loading.tsx`:

```tsx
if (!chart && id !== "new") {
  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Skeleton className="h-6 w-48" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        <div className="w-80 border-l p-3 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/chart/\[id\]/page.tsx
git commit -m "feat: add loading skeleton for chart editor page"
```

---

## Task 6: Unified Spinners in Reports

**Goal:** Replace custom CSS spinner in reports page with standard Loader2.

**Files:**
- Modify: `frontend/src/app/(dashboard)/reports/page.tsx`

**Context:** The custom CSS spinner is at lines 165-168: `<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />`. Should be replaced with `<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />`.

### Step 1: Replace spinner

Import `Loader2` from lucide-react (if not already imported). Replace lines 165-168:

From:
```tsx
{isLoading ? (
  <div className="flex justify-center py-12">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
  </div>
```

To:
```tsx
{isLoading ? (
  <div className="flex justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
```

### Step 2: Audit for other custom spinners

Search the codebase for `border-t-transparent` or `border-.*-transparent.*animate-spin` patterns. Replace any other instances found.

### Step 3: Commit

```bash
git add frontend/src/app/\(dashboard\)/reports/page.tsx
git commit -m "fix: replace custom CSS spinners with standard Loader2"
```

---

## Task 7: Embed Page Loading + Polish

**Goal:** Add loading skeleton to embed page. Verify all pieces work together.

**Files:**
- Modify: `frontend/src/app/embed/[token]/page.tsx`

**Context:** The embed page loads shared dashboard data. It should show chart skeletons while loading, not a blank iframe.

### Step 1: Add skeleton loading state to embed page

Add a loading skeleton for the embed page (shown while dashboard data is being fetched). Use the same grid pattern as dashboard loading but without header buttons (embed has no chrome).

### Step 2: Full visual verification

Verify in browser:
1. Navigate between pages — `loading.tsx` skeletons appear instantly
2. Open a dashboard — header shows first, charts load progressively as scrolled
3. Scroll down a large dashboard — charts below the fold load on demand
4. Chart editor — 3-panel skeleton shows before data loads
5. Reports page — standard Loader2 spinner
6. Re-execute a chart — subtle shimmer bar appears on the card

### Step 3: Commit

```bash
git add frontend/src/app/embed/\[token\]/page.tsx
git commit -m "feat: add loading skeleton for embed page, polish complete"
```

---

## Implementation Order

| # | Task | Effort | Dependencies |
|---|------|--------|-------------|
| 1 | Route-level loading.tsx | Small | None |
| 2 | ChartSkeleton component | Small | None |
| 3 | ChartCard skeleton + refetch indicator | Medium | Task 2 |
| 4 | Dashboard viewport-gated execution | Large | Tasks 2, 3 |
| 5 | Chart editor loading state | Small | None |
| 6 | Unified spinners | Small | None |
| 7 | Embed loading + polish | Small | Tasks 1-6 |

Tasks 1, 2, 5, 6 can run in parallel. Task 3 needs Task 2. Task 4 needs Task 3. Task 7 is final verification.
