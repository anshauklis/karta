# Dashboard Edit DnD Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the dashboard edit grid with multi-directional resize handles, column grid guides, layout undo/redo, and multi-select alignment tools.

**Architecture:** All changes are frontend-only. Feature 1 (resize handles) and Feature 2 (grid guides) are pure CSS + one prop change. Feature 3 (undo/redo) adds a new hook and wires it into the edit page. Feature 4 (multi-select + align) adds selection state, Shift+click interaction, and a floating toolbar. The edit page (`edit/page.tsx`, 927 lines) is the main file modified. No API changes.

**Tech Stack:** React 19, react-grid-layout v2 (legacy API), Tailwind CSS 4, lucide-react icons, next-intl i18n.

---

### Task 1: Multi-Directional Resize Handles — Props & Custom Handle Component

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx`

**Context:**
- The edit page uses `ReactGridLayout` (dynamically imported from `react-grid-layout/legacy`).
- Currently at line 781-796, `ReactGridLayout` receives `isDraggable`, `isResizable`, `draggableHandle`, etc. but NO `resizeHandles` or `resizeHandle` prop — so it defaults to `['se']` (bottom-right corner only).
- The legacy API accepts:
  - `resizeHandles?: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne">`
  - `resizeHandle?: ReactElement | ((axis: ResizeHandleAxis, ref: Ref<HTMLElement>) => ReactElement)`
- The `resizeHandle` render function receives an `axis` string and a `ref` that MUST be forwarded to the DOM element for RGL to track it.

**Step 1: Add a custom resize handle render function**

Before the component (after the `VISUAL_TYPES` constant around line 98), add a `forwardRef` component for the custom handle:

```tsx
import { forwardRef } from "react";

type ResizeHandleAxis = "s" | "w" | "e" | "n" | "se" | "sw" | "ne" | "nw";

const ResizeHandle = forwardRef<HTMLDivElement, { axis: ResizeHandleAxis }>(
  ({ axis, ...props }, ref) => {
    const isEdge = axis.length === 1; // s, w, e, n
    const isCorner = axis.length === 2; // se, sw, ne, nw

    // Position classes by axis
    const positionClasses: Record<string, string> = {
      s: "bottom-0 left-0 right-0 h-1.5 cursor-ns-resize",
      n: "top-0 left-0 right-0 h-1.5 cursor-ns-resize",
      w: "top-0 bottom-0 left-0 w-1.5 cursor-ew-resize",
      e: "top-0 bottom-0 right-0 w-1.5 cursor-ew-resize",
      se: "bottom-0 right-0 h-3 w-3 cursor-nwse-resize",
      sw: "bottom-0 left-0 h-3 w-3 cursor-nesw-resize",
      ne: "top-0 right-0 h-3 w-3 cursor-nesw-resize",
      nw: "top-0 left-0 h-3 w-3 cursor-nwse-resize",
    };

    return (
      <div
        ref={ref}
        className={`react-resizable-handle absolute z-30 opacity-0 group-hover:opacity-100 transition-opacity ${positionClasses[axis] || ""}`}
        {...props}
      >
        {isCorner && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400/70" />
          </div>
        )}
        {isEdge && (
          <div
            className={`absolute ${
              axis === "s" || axis === "n"
                ? "left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-0.5 w-8 rounded-full bg-blue-400/50"
                : "top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-0.5 h-8 rounded-full bg-blue-400/50"
            }`}
          />
        )}
      </div>
    );
  }
);
ResizeHandle.displayName = "ResizeHandle";
```

Also add `forwardRef` to the import from React at line 2:
```tsx
import { useEffect, useState, useCallback, useRef, useMemo, use, forwardRef } from "react";
```

**Step 2: Add the resizeHandles and resizeHandle props to ReactGridLayout**

In the `ReactGridLayout` JSX (around lines 781-796), add two new props:

```tsx
<ReactGridLayout
  className="layout"
  layout={layout}
  cols={12}
  rowHeight={1}
  width={containerWidth}
  isDraggable={true}
  isResizable={true}
  compactType={compactType}
  margin={[16, 0]}
  resizeHandles={["s", "w", "e", "n", "se", "sw", "ne", "nw"]}
  resizeHandle={(axis: ResizeHandleAxis, ref: React.Ref<HTMLElement>) => (
    <ResizeHandle key={axis} ref={ref as React.Ref<HTMLDivElement>} axis={axis} />
  )}
  onDragStart={handleDragStart}
  onResizeStart={handleResizeStart}
  onDragStop={handleDragStop}
  onResizeStop={handleResizeStop}
  draggableHandle=".drag-handle"
>
```

**Step 3: Remove old resize handle CSS and add new styles**

In `frontend/src/app/globals.css`, replace the old resize handle block (lines 153-167):

Old:
```css
/* Resize handle styling */
.react-grid-item > .react-resizable-handle {
  opacity: 0;
  transition: opacity 150ms ease;
}

.react-grid-item:hover > .react-resizable-handle {
  opacity: 1;
}

.react-grid-item > .react-resizable-handle::after {
  border-color: oklch(0.5 0.05 250) !important;
  width: 8px !important;
  height: 8px !important;
}
```

New:
```css
/* Resize handles — visibility controlled by group-hover in Tailwind on the handle component */
/* Remove default RGL handle ::after decoration (we use custom elements) */
.react-grid-item > .react-resizable-handle::after {
  display: none;
}
```

**Step 4: Verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds. Open edit mode — all 8 resize handles appear on hover, corners show dots, edges show short bars.

**Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/edit/page.tsx frontend/src/app/globals.css
git commit -m "feat: add multi-directional resize handles to dashboard grid"
```

---

### Task 2: Column Grid Guides During Drag/Resize

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx`
- Modify: `frontend/src/app/globals.css`

**Context:**
- The grid container has a ref `gridRef`. The `.grid-interacting` class is already toggled on/off during drag/resize (lines 282, 304, 312, 356).
- The grid uses `cols=12`, `margin=[16, 0]`, and the container width is tracked in `containerWidth`.
- Column width formula: `(containerWidth - 11 * 16) / 12` (11 gaps of 16px between 12 columns).

**Step 1: Set CSS custom property for column width on drag/resize start**

In `handleDragStart` (around line 279), add right after `gridRef.current?.classList.add("grid-interacting")`:

```tsx
if (gridRef.current) {
  const colW = (containerWidth - 11 * 16) / 12;
  gridRef.current.style.setProperty("--col-w", `${colW}px`);
  gridRef.current.style.setProperty("--grid-gap", "16px");
}
```

Do the same in `handleResizeStart` (around line 303), right after `gridRef.current?.classList.add("grid-interacting")`:

```tsx
if (gridRef.current) {
  const colW = (containerWidth - 11 * 16) / 12;
  gridRef.current.style.setProperty("--col-w", `${colW}px`);
  gridRef.current.style.setProperty("--grid-gap", "16px");
}
```

Note: `containerWidth` must be in the dependency arrays. `handleDragStart` already has `[freezeWidth]` — add `containerWidth`. `handleResizeStart` already has `[freezeWidth]` — add `containerWidth`.

**Step 2: Add CSS for column guides**

In `frontend/src/app/globals.css`, after the `.grid-interacting .react-grid-item` block (after line 176), add:

```css
/* Column grid guides — visible during drag/resize */
.grid-interacting {
  position: relative;
}
.grid-interacting::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to right,
    transparent 0px,
    transparent var(--col-w),
    oklch(0.7 0.05 250 / 0.12) var(--col-w),
    oklch(0.7 0.05 250 / 0.12) calc(var(--col-w) + 1px),
    transparent calc(var(--col-w) + 1px),
    transparent calc(var(--col-w) + var(--grid-gap))
  );
  background-size: calc(var(--col-w) + var(--grid-gap)) 100%;
}
.dark .grid-interacting::before {
  background: repeating-linear-gradient(
    to right,
    transparent 0px,
    transparent var(--col-w),
    oklch(0.5 0.05 250 / 0.15) var(--col-w),
    oklch(0.5 0.05 250 / 0.15) calc(var(--col-w) + 1px),
    transparent calc(var(--col-w) + 1px),
    transparent calc(var(--col-w) + var(--grid-gap))
  );
  background-size: calc(var(--col-w) + var(--grid-gap)) 100%;
}
```

**Step 3: Verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds. In edit mode, start dragging or resizing a chart — faint vertical column guides appear behind the grid.

**Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/edit/page.tsx frontend/src/app/globals.css
git commit -m "feat: show column grid guides during drag/resize"
```

---

### Task 3: Layout Undo/Redo Hook

**Files:**
- Create: `frontend/src/hooks/use-layout-history.ts`

**Context:**
- `LayoutItem` type from `@/types`: `{ id: number; grid_x: number; grid_y: number; grid_w: number; grid_h: number }`.
- The edit page calls `saveLayout.mutate(items: LayoutItem[])` to persist layout changes.
- We need a hook that manages past/future stacks and exposes `push`, `undo`, `redo`, `canUndo`, `canRedo`.

**Step 1: Create the hook**

Create `frontend/src/hooks/use-layout-history.ts`:

```tsx
"use client";

import { useState, useCallback, useRef } from "react";
import type { LayoutItem } from "@/types";

const MAX_HISTORY = 30;

interface LayoutHistory {
  push: (layout: LayoutItem[]) => void;
  undo: () => LayoutItem[] | null;
  redo: () => LayoutItem[] | null;
  canUndo: boolean;
  canRedo: boolean;
  init: (layout: LayoutItem[]) => void;
}

export function useLayoutHistory(): LayoutHistory {
  const [past, setPast] = useState<LayoutItem[][]>([]);
  const [future, setFuture] = useState<LayoutItem[][]>([]);
  const currentRef = useRef<LayoutItem[]>([]);

  const init = useCallback((layout: LayoutItem[]) => {
    currentRef.current = layout;
    setPast([]);
    setFuture([]);
  }, []);

  const push = useCallback((layout: LayoutItem[]) => {
    setPast((prev) => {
      const next = [...prev, currentRef.current];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    currentRef.current = layout;
    setFuture([]);
  }, []);

  const undo = useCallback((): LayoutItem[] | null => {
    let result: LayoutItem[] | null = null;
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const newPast = [...prev];
      const restored = newPast.pop()!;
      setFuture((f) => [...f, currentRef.current]);
      currentRef.current = restored;
      result = restored;
      return newPast;
    });
    return result;
  }, []);

  const redo = useCallback((): LayoutItem[] | null => {
    let result: LayoutItem[] | null = null;
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const newFuture = [...prev];
      const restored = newFuture.pop()!;
      setPast((p) => [...p, currentRef.current]);
      currentRef.current = restored;
      result = restored;
      return newFuture;
    });
    return result;
  }, []);

  return {
    push,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    init,
  };
}
```

**Step 2: Verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds (the hook isn't used yet, but should compile).

**Step 3: Commit**

```bash
git add frontend/src/hooks/use-layout-history.ts
git commit -m "feat: add useLayoutHistory hook for undo/redo"
```

---

### Task 4: Wire Undo/Redo Into Edit Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx`
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ru.json`

**Context:**
- The edit page already has `useHotkey` for Ctrl+S (line 152).
- `handleDragStop` (line 309) and `handleResizeStop` (line 354) call `saveLayout.mutate(items)`.
- The toolbar is in lines 548-662 — undo/redo buttons go in the layout presets area.
- `Undo2` and `Redo2` icons exist in lucide-react.

**Step 1: Import the hook and icons**

Add to imports at top of file:

```tsx
import { useLayoutHistory } from "@/hooks/use-layout-history";
```

Add `Undo2` and `Redo2` to the lucide-react import (line 59-81):

```tsx
import {
  // ...existing icons...
  Undo2,
  Redo2,
} from "lucide-react";
```

**Step 2: Initialize the history hook**

After the `layout` memo (around line 234), add:

```tsx
const layoutHistory = useLayoutHistory();
```

Initialize history when charts first load. After the `executedRef` line (around line 242), add a new useEffect:

```tsx
// Initialize layout history when charts first load
const historyInitRef = useRef(false);
useEffect(() => {
  if (visibleCharts.length > 0 && !historyInitRef.current) {
    historyInitRef.current = true;
    layoutHistory.init(
      visibleCharts.map((c) => ({
        id: c.id,
        grid_x: c.grid_x,
        grid_y: c.grid_y,
        grid_w: c.grid_w,
        grid_h: c.grid_h,
      }))
    );
  }
}, [visibleCharts]);
```

**Step 3: Push to history on drag/resize stop**

In `handleDragStop` (around line 340-349), right before `saveLayout.mutate(items)`, add:

```tsx
layoutHistory.push(items);
```

In `handleResizeStop` (around line 358-366), right before `saveLayout.mutate(items)`, add:

```tsx
layoutHistory.push(items);
```

Also do the same in `handleApplyPreset` (around line 371-375) — right before `saveLayout.mutateAsync(items)`:

```tsx
layoutHistory.push(items);
```

**Step 4: Add undo/redo handlers with keyboard shortcuts**

After the `handleRefreshChart` callback (around line 469), add:

```tsx
const handleUndo = useCallback(() => {
  const restored = layoutHistory.undo();
  if (restored && dashboard) {
    saveLayout.mutate(restored);
  }
}, [layoutHistory, dashboard, saveLayout]);

const handleRedo = useCallback(() => {
  const restored = layoutHistory.redo();
  if (restored && dashboard) {
    saveLayout.mutate(restored);
  }
}, [layoutHistory, dashboard, saveLayout]);

useHotkey("z", useCallback((e: KeyboardEvent) => {
  if (e.shiftKey) {
    handleRedo();
  } else {
    handleUndo();
  }
}, [handleUndo, handleRedo]));
```

**Step 5: Add undo/redo buttons to the toolbar**

In the toolbar (around lines 548-591), after the compact mode toggle button and before `<div className="mx-1 h-4 w-px bg-border" />`, add:

```tsx
<div className="mx-1 h-4 w-px bg-border" />
<div className="flex items-center gap-0.5">
  <button
    onClick={handleUndo}
    disabled={!layoutHistory.canUndo}
    className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
    title={tl("undo")}
  >
    <Undo2 className="h-3.5 w-3.5" />
  </button>
  <button
    onClick={handleRedo}
    disabled={!layoutHistory.canRedo}
    className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
    title={tl("redo")}
  >
    <Redo2 className="h-3.5 w-3.5" />
  </button>
</div>
```

**Step 6: Add i18n keys**

In `frontend/messages/en.json`, add to the `"layout"` object:

```json
"undo": "Undo",
"redo": "Redo"
```

In `frontend/messages/ru.json`, add to the `"layout"` object:

```json
"undo": "Отменить",
"redo": "Повторить"
```

**Step 7: Verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/edit/page.tsx frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: wire layout undo/redo into dashboard edit page"
```

---

### Task 5: Multi-Select State & Shift+Click

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx`

**Context:**
- Each chart card is rendered inside `<div key={String(chart.id)}>` at line 798.
- We need `selectedIds: Set<number>` state. Shift+click toggles selection; click without Shift clears it.
- Selected charts get a blue ring visual indicator.
- Escape key clears selection.

**Step 1: Add selection state**

After the existing state declarations (around line 188), add:

```tsx
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
```

**Step 2: Add Shift+click handler**

After the `handleMoveChartToTab` callback (around line 493), add:

```tsx
const handleChartClick = useCallback((chartId: number, e: React.MouseEvent) => {
  if (e.shiftKey) {
    e.preventDefault();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chartId)) {
        next.delete(chartId);
      } else {
        next.add(chartId);
      }
      return next;
    });
  } else {
    setSelectedIds(new Set());
  }
}, []);
```

**Step 3: Add Escape key to clear selection**

After the `handleChartClick` callback, add:

```tsx
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setSelectedIds(new Set());
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

**Step 4: Wire click handler and visual ring**

In the chart grid rendering (around line 798-845), modify the wrapper div that has `className="relative h-full group"`. Add onClick and conditional ring:

Old (line 799):
```tsx
<div className="relative h-full group">
```

New:
```tsx
<div
  className={`relative h-full group ${selectedIds.has(chart.id) ? "ring-2 ring-blue-500 rounded-lg" : ""}`}
  onClick={(e) => handleChartClick(chart.id, e)}
>
```

**Step 5: Clear selection on drag start**

In `handleDragStart` (around line 279), add at the top of the callback body:

```tsx
setSelectedIds(new Set());
```

**Step 6: Verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds. In edit mode, Shift+click on charts to select them (blue ring). Click without Shift clears. Escape clears. Starting drag clears.

**Step 7: Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/edit/page.tsx
git commit -m "feat: add multi-select with Shift+click on dashboard grid"
```

---

### Task 6: Floating Align/Distribute Toolbar

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx`
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ru.json`

**Context:**
- `selectedIds: Set<number>` is available from Task 5.
- The toolbar should appear when `selectedIds.size >= 2`.
- It should float above the grid (fixed position or absolute at top of grid area).
- Operations: align left, align right, same width, same height, distribute horizontally.
- Each operation builds a new `LayoutItem[]`, pushes to history, and saves.
- Icons from lucide-react: `AlignStartVertical`, `AlignEndVertical`, `ArrowLeftRight`, `Equal`.

**Step 1: Add alignment icons to imports**

Add to the lucide-react import:

```tsx
import {
  // ...existing...
  AlignStartVertical,
  AlignEndVertical,
  ArrowLeftRight,
  RulerIcon,
} from "lucide-react";
```

**Step 2: Add alignment operation functions**

After the `handleChartClick` callback, add:

```tsx
const applyAlignOperation = useCallback(
  (op: "alignLeft" | "alignRight" | "sameWidth" | "sameHeight" | "distributeH") => {
    if (selectedIds.size < 2 || !visibleCharts.length || !dashboard) return;

    const selected = visibleCharts.filter((c) => selectedIds.has(c.id));
    if (selected.length < 2) return;

    // Clone current layout
    const items: LayoutItem[] = visibleCharts.map((c) => ({
      id: c.id,
      grid_x: c.grid_x,
      grid_y: c.grid_y,
      grid_w: c.grid_w,
      grid_h: c.grid_h,
    }));

    const selectedMap = new Map(selected.map((c) => [c.id, c]));

    switch (op) {
      case "alignLeft": {
        const minX = Math.min(...selected.map((c) => c.grid_x));
        for (const item of items) {
          if (selectedMap.has(item.id)) item.grid_x = minX;
        }
        break;
      }
      case "alignRight": {
        const maxRight = Math.max(...selected.map((c) => c.grid_x + c.grid_w));
        for (const item of items) {
          if (selectedMap.has(item.id)) {
            item.grid_x = maxRight - item.grid_w;
          }
        }
        break;
      }
      case "sameWidth": {
        const firstW = selected[0].grid_w;
        for (const item of items) {
          if (selectedMap.has(item.id)) item.grid_w = firstW;
        }
        break;
      }
      case "sameHeight": {
        const firstH = selected[0].grid_h;
        for (const item of items) {
          if (selectedMap.has(item.id)) item.grid_h = firstH;
        }
        break;
      }
      case "distributeH": {
        const sorted = [...selected].sort((a, b) => a.grid_x - b.grid_x);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSpan = (last.grid_x + last.grid_w) - first.grid_x;
        const totalWidths = sorted.reduce((sum, c) => sum + c.grid_w, 0);
        const gap = sorted.length > 2
          ? (totalSpan - totalWidths) / (sorted.length - 1)
          : 0;
        let x = first.grid_x;
        for (const chart of sorted) {
          const item = items.find((it) => it.id === chart.id);
          if (item) {
            item.grid_x = Math.round(x);
            x += chart.grid_w + gap;
          }
        }
        break;
      }
    }

    layoutHistory.push(items);
    saveLayout.mutate(items);
  },
  [selectedIds, visibleCharts, dashboard, layoutHistory, saveLayout]
);
```

**Step 3: Add the floating toolbar JSX**

In the JSX, right before the `{/* Chart grid */}` section (around line 768, before `{!charts || charts.length === 0 ? (`), add:

```tsx
{/* Multi-select alignment toolbar */}
{selectedIds.size >= 2 && (
  <div className="sticky top-0 z-40 flex items-center justify-center py-2">
    <div className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/95 px-3 py-1.5 shadow-md dark:border-blue-800 dark:bg-blue-950/95">
      <span className="mr-2 text-xs text-blue-600 dark:text-blue-400">
        {selectedIds.size} {tl("selected")}
      </span>
      <button
        onClick={() => applyAlignOperation("alignLeft")}
        className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300"
        title={tl("alignLeft")}
      >
        <AlignStartVertical className="h-4 w-4" />
      </button>
      <button
        onClick={() => applyAlignOperation("alignRight")}
        className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300"
        title={tl("alignRight")}
      >
        <AlignEndVertical className="h-4 w-4" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-blue-200 dark:bg-blue-800" />
      <button
        onClick={() => applyAlignOperation("sameWidth")}
        className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300"
        title={tl("sameWidth")}
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>
      <button
        onClick={() => applyAlignOperation("sameHeight")}
        className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300"
        title={tl("sameHeight")}
      >
        <RulerIcon className="h-4 w-4" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-blue-200 dark:bg-blue-800" />
      <button
        onClick={() => applyAlignOperation("distributeH")}
        className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300"
        title={tl("distributeH")}
      >
        <Columns3 className="h-4 w-4" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-blue-200 dark:bg-blue-800" />
      <button
        onClick={() => setSelectedIds(new Set())}
        className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300"
        title={tc("cancel")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </div>
)}
```

Note: `Columns3` is already imported (line 69). `X` is already imported (line 79).

**Step 4: Add i18n keys**

In `frontend/messages/en.json`, add to the `"layout"` object:

```json
"selected": "selected",
"alignLeft": "Align left",
"alignRight": "Align right",
"sameWidth": "Same width",
"sameHeight": "Same height",
"distributeH": "Distribute horizontally"
```

In `frontend/messages/ru.json`, add to the `"layout"` object:

```json
"selected": "выбрано",
"alignLeft": "Выровнять влево",
"alignRight": "Выровнять вправо",
"sameWidth": "Одинаковая ширина",
"sameHeight": "Одинаковая высота",
"distributeH": "Распределить по горизонтали"
```

**Step 5: Verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/\[slug\]/edit/page.tsx frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: add floating align/distribute toolbar for multi-selected charts"
```

---

### Task 7: Full Build & Manual Test

**Files:** None (verification only)

**Step 1: Full Docker build**

Run: `docker compose up --build -d`
Expected: All 5 services healthy.

**Step 2: Manual verification checklist**

1. Open a dashboard in edit mode.
2. **Resize handles**: Hover over a chart — see handles on all 4 edges and 4 corners. Drag each to resize. Corner handles show a dot, edge handles show a short bar.
3. **Grid guides**: Start dragging a chart — faint column guides appear. Release — guides disappear.
4. **Undo/redo**: Move a chart. Click undo button or Cmd+Z — chart returns. Click redo or Cmd+Shift+Z — chart moves again. Apply a layout preset — can undo it.
5. **Multi-select**: Shift+click two charts — blue rings appear, floating toolbar shows. Click "Align left" — both snap to same column. Click "Same height" — both become same height. Press Escape — selection clears.

**Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address DnD polish issues found in manual testing"
```
