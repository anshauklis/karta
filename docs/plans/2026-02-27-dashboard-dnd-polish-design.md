# Dashboard Edit DnD Polish — Design

## Goal

Upgrade the dashboard edit grid to feel like a professional layout editor — resize from any edge, visual grid guides, undo/redo, and multi-select alignment tools.

## Features

### 1. Multi-Directional Resize Handles

**Current state:** Only bottom-right corner resize (`resizeHandles={['se']}`).

**Target:** All 8 directions — `['s', 'w', 'e', 'n', 'se', 'sw', 'ne', 'nw']`. Users can grab any edge or corner to resize, matching Apache Superset's behavior.

**Implementation:**
- Pass `resizeHandles={['s', 'w', 'e', 'n', 'se', 'sw', 'ne', 'nw']}` to `ReactGridLayout`.
- Provide `resizeHandle` render prop for custom handle elements.
- **Corner handles** (se, sw, ne, nw): 8x8 px squares, appear on hover.
- **Edge handles** (s, w, e, n): Full-length 4px-wide bars along the edge, cursor changes to `ns-resize` / `ew-resize`.
- All handles: `opacity-0` by default, `opacity-100` on chart card hover via `group-hover`.
- No resize handles on text/divider charts (keep current behavior).

**Files to modify:**
- `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx` — add `resizeHandles` prop, custom `resizeHandle` render function
- `frontend/src/app/globals.css` — style all 8 handle variants

### 2. Column Grid Guides

**Current state:** No visual column indicators during drag/resize.

**Target:** Faint 12-column guide lines appear when dragging or resizing.

**Implementation:**
- CSS-only approach using `::before` pseudo-element on the grid container.
- `repeating-linear-gradient` to draw 12 columns matching the grid's column width.
- Only visible when `.grid-interacting` class is active (already toggled on drag/resize start/stop).
- Subtle styling: 1px lines at `oklch(0.7 0 0 / 0.15)` (light theme), slightly different for dark.
- Column width = `(containerWidth - 11 * gap) / 12`. We compute this as a CSS custom property `--col-w` set via JS on the container during drag.

**Files to modify:**
- `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx` — set `--col-w` CSS variable on drag/resize start
- `frontend/src/app/globals.css` — `.grid-interacting::before` pseudo-element with column guides

### 3. Layout Undo/Redo

**Current state:** No undo. Layout changes are immediately saved to the server.

**Target:** `Cmd+Z` / `Cmd+Shift+Z` to undo/redo layout changes. Undo/redo buttons in the edit toolbar.

**Implementation:**
- Custom `useLayoutHistory` hook:
  - `past: Layout[]` — stack of previous states (max 30)
  - `future: Layout[]` — stack for redo
  - `push(layout)` — called on drag/resize stop, clears future
  - `undo()` → pops from past, pushes current to future, applies & saves
  - `redo()` → pops from future, pushes current to past, applies & saves
- Keyboard handler: `Cmd+Z` for undo, `Cmd+Shift+Z` for redo.
- Toolbar buttons: Undo (Undo2 icon) and Redo (Redo2 icon) with disabled state.
- Initial state captured when entering edit mode.
- Each undo/redo triggers the existing `saveLayout.mutate()` to persist.

**Files to modify/create:**
- `frontend/src/hooks/use-layout-history.ts` — new hook
- `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx` — integrate hook, add toolbar buttons, keyboard listener

### 4. Multi-Select + Align/Distribute

**Current state:** No multi-select. Charts are individually positioned.

**Target:** Shift+click to select multiple charts. Floating toolbar with alignment and sizing operations.

**Implementation:**
- **Selection state:** `selectedIds: Set<number>` in the edit page.
- **Selection interaction:** Shift+click on chart card toggles selection. Click without Shift clears selection. Selected charts get a blue ring (`ring-2 ring-blue-500`).
- **Floating toolbar:** Appears above the grid when 2+ charts are selected. Contains:
  - **Align left** — set all selected to `min(grid_x)`
  - **Align right** — set all selected to `max(grid_x + grid_w)`
  - **Same width** — set all to width of first selected
  - **Same height** — set all to height of first selected
  - **Distribute horizontally** — space evenly across the span
- Toolbar uses lucide-react icons: `AlignStartVertical`, `AlignEndVertical`, `EqualSquare`, `Columns3`.
- Each operation: update layout → push to undo history → save to server.
- Escape key clears selection.

**Files to modify:**
- `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx` — selection state, Shift+click handler, floating toolbar, alignment logic

## Scope Exclusions

- No drag-to-select rectangle (Shift+click is sufficient for now)
- No copy/paste of charts
- No keyboard arrow nudging of chart positions
- No snap-to-grid preview during drag (RGL handles this natively)
- Filter grid and tab container nested grids are NOT affected — only the main chart grid
