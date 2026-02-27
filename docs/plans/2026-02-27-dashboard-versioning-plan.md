# Dashboard Versioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent, full-state dashboard versioning with auto-snapshots, version history browsing, and one-click restore.

**Architecture:** New `dashboard_versions` table stores full JSONB snapshots (dashboard metadata + charts + filters + tabs). Auto-snapshots on significant edits (debounced 5 min). Backend builds snapshots from current DB state; restore overwrites all dashboard entities atomically. Frontend adds a Version History sheet panel accessible from the dashboard edit toolbar.

**Tech Stack:** FastAPI (Python, raw SQL via SQLAlchemy `text()`), PostgreSQL JSONB, Next.js 16, TanStack Query 5, shadcn/ui Sheet, next-intl i18n (en/ru).

**Design doc:** `docs/plans/2026-02-27-dashboard-versioning-design.md`

---

### Task 1: Database Schema — `dashboard_versions` table

**Files:**
- Modify: `api/database.py` — add table DDL to `SCHEMA_SQL`

**Context:**
- The project uses `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` in `SCHEMA_SQL` string (in `api/database.py`). No migration framework.
- `ensure_schema()` runs this SQL on startup.
- Existing tables to reference: `dashboards`, `charts`, `dashboard_filters`, `dashboard_tabs`.

**Step 1: Add the table DDL**

Add this before the closing `"""` of `SCHEMA_SQL` (before the existing indexes block near the end), right after the `model_joins` table definition:

```sql
CREATE TABLE IF NOT EXISTS dashboard_versions (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    label           TEXT DEFAULT '',
    is_auto         BOOLEAN DEFAULT TRUE,
    snapshot        JSONB NOT NULL,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dashboard_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_versions_dashboard
    ON dashboard_versions(dashboard_id, version_number DESC);
```

**Step 2: Verify**

Run: `docker compose up --build -d && docker compose logs -f api 2>&1 | head -50`
Expected: API starts cleanly, `ensure_schema()` creates the table without errors.

**Step 3: Commit**

```
feat: add dashboard_versions table for persistent snapshots
```

---

### Task 2: Backend — Snapshot Builder + Version CRUD Router

**Files:**
- Create: `api/versions/router.py` — all version endpoints + snapshot logic
- Modify: `api/main.py` — register the new router
- Modify: `api/models.py` — add Pydantic request/response models

**Context:**
- The project registers routers in `api/main.py` via `app.include_router(...)`. Each router is a `APIRouter(prefix="/api/dashboards", tags=["dashboard_versions"])`.
- All endpoints use `require_role("editor", "admin")` from `api.auth.dependencies` for write operations, and `Depends(get_current_user)` for reads.
- All SQL uses `text()` from SQLAlchemy with named params. No ORM.
- The `engine` comes from `api.database`.
- JSON encoding uses `api.json_util` (aliased as `json`) which handles datetimes etc.
- See `api/dashboards/router.py` `clone_dashboard()` for the pattern of reading all dashboard sub-entities (charts, tabs, filters) — the snapshot builder follows the same pattern.

**Step 1: Add Pydantic models to `api/models.py`**

Add at the end of the file (before any trailing newlines), after the last model class:

```python
# --- Dashboard Versions ---

class VersionCreate(BaseModel):
    label: str = ""

class VersionLabelUpdate(BaseModel):
    label: str

class VersionListItem(BaseModel):
    id: int
    dashboard_id: int
    version_number: int
    label: str
    is_auto: bool
    created_by: Optional[int]
    created_at: datetime

class VersionDetail(VersionListItem):
    snapshot: dict
```

**Step 2: Create `api/versions/router.py`**

Create the file with this complete content:

```python
import api.json_util as json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import VersionCreate, VersionLabelUpdate, VersionListItem, VersionDetail
from api.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/dashboards", tags=["dashboard_versions"])

# ---------------------------------------------------------------------------
# Snapshot builder
# ---------------------------------------------------------------------------

def _build_snapshot(conn, dashboard_id: int) -> dict:
    """Build a full JSON snapshot of a dashboard's current state."""
    # Dashboard metadata
    dash = conn.execute(text("""
        SELECT title, description, icon, filter_layout, color_scheme
        FROM dashboards WHERE id = :id
    """), {"id": dashboard_id}).mappings().first()
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    metadata = dict(dash)

    # Charts
    charts = conn.execute(text("""
        SELECT id, title, description, mode, chart_type, chart_config, chart_code,
               sql_query, connection_id, dataset_id, variables,
               grid_x, grid_y, grid_w, grid_h, tab_id, position_order
        FROM charts WHERE dashboard_id = :did ORDER BY position_order
    """), {"did": dashboard_id}).mappings().all()
    charts_list = [dict(c) for c in charts]

    # Filters
    filters = conn.execute(text("""
        SELECT id, label, filter_type, target_column, default_value,
               sort_order, config, group_name
        FROM dashboard_filters WHERE dashboard_id = :did ORDER BY sort_order
    """), {"did": dashboard_id}).mappings().all()
    filters_list = [dict(f) for f in filters]

    # Tabs
    tabs = conn.execute(text("""
        SELECT id, title, position_order
        FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order
    """), {"did": dashboard_id}).mappings().all()
    tabs_list = [dict(t) for t in tabs]

    return {
        "metadata": metadata,
        "charts": charts_list,
        "filters": filters_list,
        "tabs": tabs_list,
    }


def _next_version_number(conn, dashboard_id: int) -> int:
    row = conn.execute(text("""
        SELECT COALESCE(MAX(version_number), 0) FROM dashboard_versions
        WHERE dashboard_id = :did
    """), {"did": dashboard_id}).scalar()
    return row + 1


def _prune_auto_versions(conn, dashboard_id: int, max_auto: int = 50):
    """Delete oldest auto-versions beyond the limit."""
    conn.execute(text("""
        DELETE FROM dashboard_versions
        WHERE id IN (
            SELECT id FROM dashboard_versions
            WHERE dashboard_id = :did AND is_auto = TRUE
            ORDER BY version_number DESC
            OFFSET :keep
        )
    """), {"did": dashboard_id, "keep": max_auto})


def create_auto_version(dashboard_id: int, user_id: int) -> bool:
    """Create an auto-version if the last one is older than 5 minutes.

    Returns True if a version was created, False if skipped (debounce).
    Call this from dashboard/layout update endpoints.
    """
    with engine.connect() as conn:
        # Check debounce: last auto-version must be > 5 min ago
        last = conn.execute(text("""
            SELECT created_at FROM dashboard_versions
            WHERE dashboard_id = :did AND is_auto = TRUE
            ORDER BY version_number DESC LIMIT 1
        """), {"did": dashboard_id}).scalar()

        if last:
            from datetime import datetime, timezone, timedelta
            now = datetime.now(timezone.utc)
            if last.tzinfo is None:
                from datetime import timezone as tz
                last = last.replace(tzinfo=tz.utc)
            if (now - last) < timedelta(minutes=5):
                return False

        snapshot = _build_snapshot(conn, dashboard_id)
        version_number = _next_version_number(conn, dashboard_id)

        conn.execute(text("""
            INSERT INTO dashboard_versions (dashboard_id, version_number, label, is_auto, snapshot, created_by)
            VALUES (:did, :vn, '', TRUE, CAST(:snap AS jsonb), :uid)
        """), {
            "did": dashboard_id,
            "vn": version_number,
            "snap": json.dumps(snapshot, default=str),
            "uid": user_id,
        })

        _prune_auto_versions(conn, dashboard_id)
        conn.commit()
        return True


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/{dashboard_id}/versions", response_model=list[VersionListItem],
            summary="List dashboard versions")
def list_versions(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, dashboard_id, version_number, label, is_auto, created_by, created_at
            FROM dashboard_versions
            WHERE dashboard_id = :did
            ORDER BY version_number DESC
        """), {"did": dashboard_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{dashboard_id}/versions/{version_id}", response_model=VersionDetail,
            summary="Get version with snapshot")
def get_version(dashboard_id: int, version_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, dashboard_id, version_number, label, is_auto, snapshot, created_by, created_at
            FROM dashboard_versions
            WHERE id = :vid AND dashboard_id = :did
        """), {"vid": version_id, "did": dashboard_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Version not found")
    return dict(row)


@router.post("/{dashboard_id}/versions", response_model=VersionListItem, status_code=201,
             summary="Create manual version")
def create_version(dashboard_id: int, req: VersionCreate,
                   current_user: dict = require_role("editor", "admin")):
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        snapshot = _build_snapshot(conn, dashboard_id)
        version_number = _next_version_number(conn, dashboard_id)

        row = conn.execute(text("""
            INSERT INTO dashboard_versions (dashboard_id, version_number, label, is_auto, snapshot, created_by)
            VALUES (:did, :vn, :label, FALSE, CAST(:snap AS jsonb), :uid)
            RETURNING id, dashboard_id, version_number, label, is_auto, created_by, created_at
        """), {
            "did": dashboard_id,
            "vn": version_number,
            "label": req.label,
            "snap": json.dumps(snapshot, default=str),
            "uid": user_id,
        }).mappings().first()
        conn.commit()
    return dict(row)


@router.post("/{dashboard_id}/versions/{version_id}/restore",
             summary="Restore dashboard to a version")
def restore_version(dashboard_id: int, version_id: int,
                    current_user: dict = require_role("editor", "admin")):
    user_id = int(current_user["sub"])

    with engine.connect() as conn:
        # Load the target version
        ver = conn.execute(text("""
            SELECT snapshot FROM dashboard_versions
            WHERE id = :vid AND dashboard_id = :did
        """), {"vid": version_id, "did": dashboard_id}).mappings().first()
        if not ver:
            raise HTTPException(status_code=404, detail="Version not found")

        snap = ver["snapshot"]
        if isinstance(snap, str):
            snap = json.loads(snap)

        # 1. Create a pre-restore auto-version (so restore is undoable)
        pre_snapshot = _build_snapshot(conn, dashboard_id)
        pre_vn = _next_version_number(conn, dashboard_id)
        conn.execute(text("""
            INSERT INTO dashboard_versions (dashboard_id, version_number, label, is_auto, snapshot, created_by)
            VALUES (:did, :vn, 'Before restore', TRUE, CAST(:snap AS jsonb), :uid)
        """), {
            "did": dashboard_id,
            "vn": pre_vn,
            "snap": json.dumps(pre_snapshot, default=str),
            "uid": user_id,
        })

        meta = snap["metadata"]

        # 2. Update dashboard metadata
        conn.execute(text("""
            UPDATE dashboards
            SET title = :title, description = :description, icon = :icon,
                filter_layout = CAST(:fl AS jsonb), color_scheme = :cs, updated_at = NOW()
            WHERE id = :id
        """), {
            "id": dashboard_id,
            "title": meta["title"],
            "description": meta.get("description", ""),
            "icon": meta.get("icon", "📊"),
            "fl": json.dumps(meta.get("filter_layout", {})),
            "cs": meta.get("color_scheme"),
        })

        # 3. Recreate tabs — delete all, re-insert, build old_id -> new_id map
        conn.execute(text(
            "UPDATE charts SET tab_id = NULL WHERE dashboard_id = :did"
        ), {"did": dashboard_id})
        conn.execute(text(
            "DELETE FROM dashboard_tabs WHERE dashboard_id = :did"
        ), {"did": dashboard_id})

        tab_map = {}  # old snapshot tab id -> new tab id
        for tab in snap.get("tabs", []):
            new_tab = conn.execute(text("""
                INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                VALUES (:did, :title, :pos) RETURNING id
            """), {
                "did": dashboard_id,
                "title": tab["title"],
                "pos": tab["position_order"],
            }).mappings().first()
            tab_map[tab["id"]] = new_tab["id"]

        # If no tabs in snapshot, create a default
        if not snap.get("tabs"):
            default_tab = conn.execute(text("""
                INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                VALUES (:did, 'Main', 0) RETURNING id
            """), {"did": dashboard_id}).mappings().first()

        # 4. Recreate charts — delete existing, re-insert from snapshot
        conn.execute(text(
            "DELETE FROM charts WHERE dashboard_id = :did"
        ), {"did": dashboard_id})

        for chart in snap.get("charts", []):
            new_tab_id = tab_map.get(chart.get("tab_id")) if chart.get("tab_id") else None
            config_json = json.dumps(chart["chart_config"]) if chart.get("chart_config") else "{}"
            variables_json = json.dumps(chart.get("variables")) if chart.get("variables") else "[]"
            conn.execute(text("""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description,
                    mode, chart_type, chart_config, chart_code, sql_query, variables,
                    position_order, grid_x, grid_y, grid_w, grid_h, tab_id, created_by)
                VALUES (:did, :cid, :dsid, :title, :desc,
                    :mode, :ctype, CAST(:config AS jsonb), :code, :sql, CAST(:vars AS jsonb),
                    :pos, :gx, :gy, :gw, :gh, :tid, :uid)
            """), {
                "did": dashboard_id,
                "cid": chart.get("connection_id"),
                "dsid": chart.get("dataset_id"),
                "title": chart["title"],
                "desc": chart.get("description", ""),
                "mode": chart.get("mode", "visual"),
                "ctype": chart.get("chart_type"),
                "config": config_json,
                "code": chart.get("chart_code", ""),
                "sql": chart.get("sql_query", ""),
                "vars": variables_json,
                "pos": chart.get("position_order", 0),
                "gx": chart.get("grid_x", 0),
                "gy": chart.get("grid_y", 0),
                "gw": chart.get("grid_w", 6),
                "gh": chart.get("grid_h", 4),
                "tid": new_tab_id,
                "uid": user_id,
            })

        # 5. Recreate filters
        conn.execute(text(
            "DELETE FROM dashboard_filters WHERE dashboard_id = :did"
        ), {"did": dashboard_id})

        for f in snap.get("filters", []):
            filter_config = json.dumps(f.get("config", {})) if f.get("config") else "{}"
            conn.execute(text("""
                INSERT INTO dashboard_filters (dashboard_id, label, filter_type, target_column,
                    default_value, sort_order, config, group_name)
                VALUES (:did, :label, :ftype, :col, :default, :order, CAST(:config AS jsonb), :group)
            """), {
                "did": dashboard_id,
                "label": f["label"],
                "ftype": f["filter_type"],
                "col": f["target_column"],
                "default": f.get("default_value"),
                "order": f.get("sort_order", 0),
                "config": filter_config,
                "group": f.get("group_name"),
            })

        conn.commit()

    return {"status": "restored", "version_id": version_id}


@router.put("/{dashboard_id}/versions/{version_id}", response_model=VersionListItem,
            summary="Update version label")
def update_version_label(dashboard_id: int, version_id: int, req: VersionLabelUpdate,
                         current_user: dict = require_role("editor", "admin")):
    with engine.connect() as conn:
        row = conn.execute(text("""
            UPDATE dashboard_versions SET label = :label
            WHERE id = :vid AND dashboard_id = :did
            RETURNING id, dashboard_id, version_number, label, is_auto, created_by, created_at
        """), {"vid": version_id, "did": dashboard_id, "label": req.label}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Version not found")
        conn.commit()
    return dict(row)


@router.delete("/{dashboard_id}/versions/{version_id}", status_code=204,
               summary="Delete a version")
def delete_version(dashboard_id: int, version_id: int,
                   current_user: dict = require_role("editor", "admin")):
    with engine.connect() as conn:
        result = conn.execute(text("""
            DELETE FROM dashboard_versions WHERE id = :vid AND dashboard_id = :did
        """), {"vid": version_id, "did": dashboard_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Version not found")
        conn.commit()
```

**Step 3: Register the router in `api/main.py`**

Add the import after the existing router imports (around line 123-147):
```python
from api.versions.router import router as versions_router
```

Add the include after the existing `app.include_router(...)` calls (around line 150-174):
```python
app.include_router(versions_router)
```

Also add a tag entry to the `openapi_tags` list:
```python
{"name": "dashboard_versions", "description": "Dashboard version history and restore"},
```

**Step 4: Create `api/versions/__init__.py`**

Empty file — required for Python package.

**Step 5: Verify**

Run: `docker compose up --build -d && docker compose logs -f api 2>&1 | head -50`
Expected: API starts, no import errors. Check `/docs` endpoint shows the new version endpoints.

**Step 6: Commit**

```
feat: add dashboard versioning API — snapshot builder, CRUD, restore
```

---

### Task 3: Wire Auto-Versioning into Dashboard/Layout Updates

**Files:**
- Modify: `api/dashboards/router.py` — call `create_auto_version` from `update_dashboard()`
- Modify: `api/charts/router.py` — call `create_auto_version` from `update_layout()`

**Context:**
- `update_dashboard()` is at `api/dashboards/router.py` — already imports `record_change` from `api.history`. Add `create_auto_version` after the successful update.
- `update_layout()` is at `api/charts/router.py` — the `PUT /api/dashboards/{dashboard_id}/layout` endpoint. Add auto-versioning after the layout is saved.
- The `create_auto_version` function handles its own connection and debounce logic, so just call it with `(dashboard_id, user_id)`.
- Import with: `from api.versions.router import create_auto_version`
- Use `try/except` around the call — versioning failure should never block the primary save.

**Step 1: Add auto-versioning to `update_dashboard()`**

In `api/dashboards/router.py`, inside `update_dashboard()`, add after the final `return` line preparation but before `return get_dashboard(...)`:

```python
    # Auto-version (best-effort, never blocks the save)
    try:
        from api.versions.router import create_auto_version
        create_auto_version(dashboard_id, int(current_user["sub"]))
    except Exception:
        pass
```

Place this right before `return get_dashboard(dashboard_id, current_user)`.

**Step 2: Add auto-versioning to `update_layout()`**

In `api/charts/router.py`, in the `update_layout()` function (around line 922), add after `conn.commit()`:

```python
    # Auto-version (best-effort)
    try:
        from api.versions.router import create_auto_version
        create_auto_version(dashboard_id, int(current_user["sub"]))
    except Exception:
        pass
```

**Step 3: Verify**

Run: `docker compose up --build -d`

Test manually: update a dashboard title via API, then check `GET /api/dashboards/{id}/versions` returns a version.

**Step 4: Commit**

```
feat: wire auto-versioning into dashboard and layout updates
```

---

### Task 4: Frontend — TanStack Query Hooks for Versions API

**Files:**
- Create: `frontend/src/hooks/use-versions.ts`

**Context:**
- Follow the exact same pattern as `frontend/src/hooks/use-semantic.ts` or any hook in `frontend/src/hooks/`.
- Every hook: `useSession()` → `session?.accessToken` → `api.get/post/put/delete(url, token)`.
- Mutations invalidate relevant query keys on success.
- The `api` client is imported from `@/lib/api`.

**Step 1: Create the hooks file**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";

interface VersionListItem {
  id: number;
  dashboard_id: number;
  version_number: number;
  label: string;
  is_auto: boolean;
  created_by: number | null;
  created_at: string;
}

interface VersionDetail extends VersionListItem {
  snapshot: Record<string, unknown>;
}

export function useDashboardVersions(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-versions", dashboardId],
    queryFn: () =>
      api.get<VersionListItem[]>(
        `/api/dashboards/${dashboardId}/versions`,
        token
      ),
    enabled: !!token && !!dashboardId,
    staleTime: 30_000,
  });
}

export function useVersionDetail(
  dashboardId: number | undefined,
  versionId: number | null
) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-version-detail", dashboardId, versionId],
    queryFn: () =>
      api.get<VersionDetail>(
        `/api/dashboards/${dashboardId}/versions/${versionId}`,
        token
      ),
    enabled: !!token && !!dashboardId && versionId !== null,
  });
}

export function useCreateVersion() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      label,
    }: {
      dashboardId: number;
      label: string;
    }) =>
      api.post<VersionListItem>(
        `/api/dashboards/${dashboardId}/versions`,
        { label },
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
    },
  });
}

export function useRestoreVersion() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      versionId,
    }: {
      dashboardId: number;
      versionId: number;
    }) =>
      api.post(
        `/api/dashboards/${dashboardId}/versions/${versionId}/restore`,
        {},
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", "slug"],
      });
      queryClient.invalidateQueries({
        queryKey: ["charts", variables.dashboardId],
      });
    },
  });
}

export function useUpdateVersionLabel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      versionId,
      label,
    }: {
      dashboardId: number;
      versionId: number;
      label: string;
    }) =>
      api.put<VersionListItem>(
        `/api/dashboards/${dashboardId}/versions/${versionId}`,
        { label },
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
    },
  });
}

export function useDeleteVersion() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      versionId,
    }: {
      dashboardId: number;
      versionId: number;
    }) =>
      api.delete(
        `/api/dashboards/${dashboardId}/versions/${versionId}`,
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
    },
  });
}
```

**Step 2: Verify**

Run: `cd frontend && npm run lint -- --no-error-on-unmatched-pattern src/hooks/use-versions.ts`
Expected: No errors.

**Step 3: Commit**

```
feat: add TanStack Query hooks for dashboard versioning API
```

---

### Task 5: Frontend — Version History Panel Component

**Files:**
- Create: `frontend/src/components/dashboard/version-history-panel.tsx`

**Context:**
- Use shadcn/ui `Sheet` (from `@/components/ui/sheet`) — side panel sliding from the right.
- Use `useDashboardVersions`, `useCreateVersion`, `useRestoreVersion`, `useUpdateVersionLabel`, `useDeleteVersion` from `@/hooks/use-versions`.
- Use `useTranslations("versions")` for i18n (keys will be added in Task 7).
- Use `AlertDialog` from `@/components/ui/alert-dialog` for restore confirmation.
- Format timestamps with relative time (e.g., "5 minutes ago"). Use `formatDistanceToNow` from `date-fns` (already in package.json).
- Use `Badge` for auto/manual labels.
- Inline label editing: click label → input field → blur/Enter saves.
- The existing `HistoryPanel` (`frontend/src/components/history-panel.tsx`) shows the audit log — keep it. The new `VersionHistoryPanel` is a separate component.
- `toast` from `sonner` for success messages (same pattern as other mutations in the project).

**Step 1: Create the component**

```tsx
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Save, Trash2, Pencil, Check, X } from "lucide-react";
import {
  useDashboardVersions,
  useCreateVersion,
  useRestoreVersion,
  useUpdateVersionLabel,
  useDeleteVersion,
} from "@/hooks/use-versions";

interface VersionHistoryPanelProps {
  dashboardId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}

export function VersionHistoryPanel({
  dashboardId,
  open,
  onOpenChange,
  onRestored,
}: VersionHistoryPanelProps) {
  const t = useTranslations("versions");
  const { data: versions, isLoading } = useDashboardVersions(
    open ? dashboardId : undefined
  );
  const createVersion = useCreateVersion();
  const restoreVersion = useRestoreVersion();
  const updateLabel = useUpdateVersionLabel();
  const deleteVersion = useDeleteVersion();

  const [newLabel, setNewLabel] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleSaveVersion = useCallback(() => {
    createVersion.mutate(
      { dashboardId, label: newLabel || "" },
      {
        onSuccess: () => {
          toast.success(t("versionSaved"));
          setNewLabel("");
        },
      }
    );
  }, [createVersion, dashboardId, newLabel, t]);

  const handleRestore = useCallback(() => {
    if (restoreTarget === null) return;
    restoreVersion.mutate(
      { dashboardId, versionId: restoreTarget },
      {
        onSuccess: () => {
          toast.success(t("restored"));
          setRestoreTarget(null);
          onRestored();
        },
      }
    );
  }, [restoreVersion, dashboardId, restoreTarget, t, onRestored]);

  const handleSaveLabel = useCallback(
    (versionId: number) => {
      updateLabel.mutate(
        { dashboardId, versionId, label: editLabel },
        {
          onSuccess: () => {
            toast.success(t("labelUpdated"));
            setEditingId(null);
          },
        }
      );
    },
    [updateLabel, dashboardId, editLabel, t]
  );

  const handleDelete = useCallback(
    (versionId: number) => {
      deleteVersion.mutate(
        { dashboardId, versionId },
        {
          onSuccess: () => {
            toast.success(t("versionDeleted"));
          },
        }
      );
    },
    [deleteVersion, dashboardId, t]
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[440px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="text-sm">{t("title")}</SheetTitle>
          </SheetHeader>

          {/* Save version */}
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <Input
              placeholder={t("labelPlaceholder")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveVersion();
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveVersion}
              disabled={createVersion.isPending}
              className="h-8 shrink-0"
            >
              {createVersion.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              {t("saveVersion")}
            </Button>
          </div>

          {/* Version list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !versions || versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <p className="text-sm text-muted-foreground">
                  {t("noVersions")}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="px-4 py-3 hover:bg-muted/50 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              v.is_auto
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {v.is_auto ? t("autoLabel") : t("manualLabel")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            v{v.version_number}
                          </span>
                        </div>

                        {editingId === v.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="h-6 text-xs"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveLabel(v.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveLabel(v.id)}
                              className="rounded p-0.5 hover:bg-muted"
                            >
                              <Check className="h-3 w-3 text-primary" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded p-0.5 hover:bg-muted"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs truncate">
                              {v.label || (
                                <span className="italic text-muted-foreground">
                                  {t("noLabel")}
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => {
                                setEditingId(v.id);
                                setEditLabel(v.label);
                              }}
                              className="rounded p-0.5 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(v.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => setRestoreTarget(v.id)}
                          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                          title={t("restore")}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-destructive"
                          title={t("delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore confirmation */}
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("restoreConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("restoreDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoreVersion.isPending}
            >
              {restoreVersion.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
              )}
              {t("restore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Step 2: Verify**

Run: `cd frontend && npm run lint -- --no-error-on-unmatched-pattern src/components/dashboard/version-history-panel.tsx`
Expected: No errors (i18n keys not yet created, but lint won't catch that).

**Step 3: Commit**

```
feat: add VersionHistoryPanel component with restore, label edit, delete
```

---

### Task 6: Frontend — Wire Version History Panel into Dashboard Edit Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/edit/page.tsx`

**Context:**
- The edit page already has a History button (line ~828) that opens the existing `HistoryPanel` (audit log). We'll **replace** that button's behavior to open the new `VersionHistoryPanel` instead. The old audit log panel can stay accessible from the Properties dialog or be toggled.
- Actually, better: add a **new button** (Clock icon) next to the existing History button for version history. Keep the existing History button for the audit log.
- The undo/redo buttons are at lines 798-816. The History button is at line 828-830. Place the version history button right after the undo/redo group, before the description button.
- On restore success (`onRestored` callback), refresh the page data by calling `router.refresh()` or invalidating the dashboard query.

**Step 1: Add imports and state**

Add to the import block at the top of the file:
```typescript
import { VersionHistoryPanel } from "@/components/dashboard/version-history-panel";
```

Add a new `import` for the `Clock` icon from lucide-react (add to the existing lucide import line):
```typescript
Clock,
```

Add state variable (near the other `useState` declarations around line 232):
```typescript
const [showVersions, setShowVersions] = useState(false);
```

**Step 2: Add the version history button to the toolbar**

After the undo/redo `<div>` group (after line ~816, before the separator), add:

```tsx
<button
  onClick={() => setShowVersions(true)}
  className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
  title={tl("versionHistory")}
>
  <Clock className="h-3.5 w-3.5" />
</button>
```

**Step 3: Add the panel render**

Near the bottom of the component's JSX return, next to the existing `{showHistory && ...}` block (around line 1141), add:

```tsx
<VersionHistoryPanel
  dashboardId={dashboard.id}
  open={showVersions}
  onOpenChange={setShowVersions}
  onRestored={() => {
    setShowVersions(false);
    router.refresh();
  }}
/>
```

**Step 4: Verify**

Run: `cd frontend && npm run lint -- --no-error-on-unmatched-pattern 'src/app/(dashboard)/dashboard/[slug]/edit/page.tsx'`
Expected: No errors.

**Step 5: Commit**

```
feat: add version history button and panel to dashboard edit toolbar
```

---

### Task 7: i18n — Add Translation Keys

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ru.json`

**Context:**
- i18n uses `next-intl`. Translations are flat JSON objects organized by namespace.
- The `VersionHistoryPanel` uses `useTranslations("versions")`.
- The edit page toolbar button uses `tl("versionHistory")` where `tl = useTranslations("dashboardLayout")`.
- Both `en.json` and `ru.json` must have identical key sets.
- The component references these keys: `title`, `saveVersion`, `labelPlaceholder`, `noVersions`, `autoLabel`, `manualLabel`, `noLabel`, `restore`, `restoreConfirm`, `restoreDescription`, `cancel`, `restored`, `versionSaved`, `versionDeleted`, `labelUpdated`, `delete`.

**Step 1: Add `versions` namespace to `en.json`**

Add this block to `en.json` (at the end, before the final `}`):

```json
"versions": {
  "title": "Version History",
  "saveVersion": "Save Version",
  "labelPlaceholder": "Version label (optional)",
  "noVersions": "No versions yet. Versions are created automatically when you edit the dashboard.",
  "autoLabel": "auto",
  "manualLabel": "manual",
  "noLabel": "No label",
  "restore": "Restore",
  "restoreConfirm": "Restore this version?",
  "restoreDescription": "This will replace the current dashboard state with this version. A backup of the current state will be saved automatically.",
  "cancel": "Cancel",
  "restored": "Dashboard restored to selected version",
  "versionSaved": "Version saved",
  "versionDeleted": "Version deleted",
  "labelUpdated": "Label updated",
  "delete": "Delete"
}
```

**Step 2: Add `versions` namespace to `ru.json`**

```json
"versions": {
  "title": "История версий",
  "saveVersion": "Сохранить версию",
  "labelPlaceholder": "Название версии (необязательно)",
  "noVersions": "Версий пока нет. Версии создаются автоматически при редактировании дашборда.",
  "autoLabel": "авто",
  "manualLabel": "вручную",
  "noLabel": "Без названия",
  "restore": "Восстановить",
  "restoreConfirm": "Восстановить эту версию?",
  "restoreDescription": "Текущее состояние дашборда будет заменено выбранной версией. Резервная копия текущего состояния сохранится автоматически.",
  "cancel": "Отмена",
  "restored": "Дашборд восстановлен до выбранной версии",
  "versionSaved": "Версия сохранена",
  "versionDeleted": "Версия удалена",
  "labelUpdated": "Название обновлено",
  "delete": "Удалить"
}
```

**Step 3: Add `versionHistory` key to `dashboardLayout` namespace**

In both `en.json` and `ru.json`, add to the existing `dashboardLayout` namespace:

`en.json`:
```json
"versionHistory": "Version History"
```

`ru.json`:
```json
"versionHistory": "История версий"
```

**Step 4: Verify i18n parity**

Run a quick check that both files have the same keys:
```bash
cd frontend && node -e "
const en = require('./messages/en.json');
const ru = require('./messages/ru.json');
const enKeys = Object.keys(en.versions || {}).sort().join(',');
const ruKeys = Object.keys(ru.versions || {}).sort().join(',');
console.log('EN versions keys:', enKeys);
console.log('RU versions keys:', ruKeys);
console.log('Match:', enKeys === ruKeys);
"
```
Expected: `Match: true`

**Step 5: Commit**

```
feat: add i18n translations for dashboard versioning (en + ru)
```

---

### Task 8: Lint + Build Verification

**Files:** None — verification only.

**Step 1: Run backend lint**

```bash
cd api && uv run ruff check .
```
Expected: All checks passed.

**Step 2: Run frontend lint**

```bash
cd frontend && npm run lint
```
Expected: No errors.

**Step 3: Docker build**

```bash
docker compose up --build -d
```
Expected: All services start cleanly.

**Step 4: Verify API starts and endpoints work**

```bash
# Check API health
docker compose logs api 2>&1 | tail -20

# Check /docs shows version endpoints
curl -s http://localhost/docs | grep -o 'versions' | head -5
```

**Step 5: Commit lint fixes if any**

```
fix: lint — dashboard versioning
```
