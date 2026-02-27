# Dashboard Versioning — Design

## Goal

Persistent, full-state versioning for dashboards. Users can browse version history, preview any past state, and restore a dashboard to any previous version.

## Decisions

- **Storage**: Full JSON snapshots (not diffs). ~5-50KB per version — space is negligible.
- **Auto-versioning**: On significant changes (layout save, metadata update), debounced at 5 min.
- **Restore scope**: Full — metadata, chart configs, SQL, layout, filters, tabs.
- **Max auto-versions**: 50 per dashboard, oldest pruned. Manual (labeled) versions never pruned.

## Data Model

### New table: `dashboard_versions`

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

### Snapshot JSONB schema

```json
{
  "metadata": {
    "title": "Sales Dashboard",
    "description": "...",
    "icon": "📊",
    "filter_layout": {},
    "color_scheme": "default"
  },
  "charts": [
    {
      "id": 123,
      "title": "Revenue by Region",
      "chart_type": "bar",
      "chart_config": { ... },
      "sql_query": "SELECT ...",
      "mode": "visual",
      "chart_code": "",
      "connection_id": 1,
      "dataset_id": 2,
      "variables": [],
      "grid_x": 0, "grid_y": 0, "grid_w": 6, "grid_h": 4,
      "tab_id": 1,
      "position_order": 0
    }
  ],
  "filters": [
    {
      "id": 10,
      "label": "Region",
      "filter_type": "select",
      "target_column": "region",
      "default_value": null,
      "sort_order": 0,
      "config": {},
      "group_name": null
    }
  ],
  "tabs": [
    { "id": 1, "title": "Overview", "position_order": 0 }
  ]
}
```

## API Endpoints

All under `/api/dashboards/{dashboard_id}/versions`. Require `editor` or `admin` role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/versions` | List versions (id, version_number, label, is_auto, created_by, created_at). No snapshot body — lightweight. |
| GET | `/versions/{version_id}` | Get full version with snapshot for preview. |
| POST | `/versions` | Create manual version with optional `{ "label": "..." }`. |
| POST | `/versions/{version_id}/restore` | Restore dashboard to this version. Creates a "pre-restore" auto-version first. |
| PUT | `/versions/{version_id}` | Update label only. |
| DELETE | `/versions/{version_id}` | Delete a version. |

## Backend Logic

### Snapshot creation (`_create_snapshot`)

Reads current state from DB:
1. Dashboard row (title, description, icon, filter_layout, color_scheme)
2. All charts for this dashboard (full columns)
3. All dashboard_filters for this dashboard
4. All dashboard_tabs for this dashboard

Returns the JSONB structure above.

### Auto-versioning

Called from:
- `update_dashboard()` — after successful update
- `update_layout()` — after successful layout save

Logic:
1. Check last auto-version's `created_at` for this dashboard
2. If < 5 minutes ago, skip (debounce)
3. Otherwise, create version with `is_auto=True`, no label
4. Count auto-versions; if > 50, delete oldest auto-versions (keep manual ones)

### Restore logic (`_restore_from_snapshot`)

Atomic, in a single transaction:
1. Create a "pre-restore" auto-version (so restore is undoable)
2. Update dashboard metadata from `snapshot.metadata`
3. Get current chart IDs. For each chart in snapshot:
   - If chart ID exists in current dashboard → UPDATE all fields
   - If chart ID missing from current → INSERT (preserving original ID if possible, or create new)
4. Delete charts in current that aren't in the snapshot
5. Delete all dashboard_filters, re-insert from snapshot
6. Delete all dashboard_tabs, re-insert from snapshot (update chart tab_id references)

**Chart ID handling**: Snapshot stores original chart IDs. On restore, if a chart was deleted since the snapshot, it gets recreated with a new ID. Tab references are remapped accordingly.

## Frontend

### Version History Panel

- **Trigger**: Clock icon (History) button in dashboard edit toolbar, next to undo/redo buttons
- **Panel**: Sheet sliding from the right. Shows a timeline of versions.
- **Each version entry**:
  - Relative timestamp ("5 minutes ago", "Yesterday at 3:00 PM")
  - Author name
  - Label (editable inline via click-to-edit)
  - Badge: "auto" or "manual"
  - "Restore" button (with confirmation dialog)
- **Preview**: Click a version row → show snapshot summary (chart count, filter count, tab count)
- **"Save Version" button** at the top of the panel → creates manual version with label input

### Hooks

- `useDashboardVersions(dashboardId)` — list versions (TanStack Query)
- `useCreateVersion()` — manual save (mutation, invalidates versions query)
- `useRestoreVersion()` — restore (mutation, invalidates dashboard + charts + versions)
- `useUpdateVersionLabel()` — inline label edit (mutation)
- `useDeleteVersion()` — delete a version (mutation)

### i18n keys (namespace: `versions`)

```
title, saveVersion, restore, restoreConfirm, restoreDescription,
autoLabel, manualLabel, labelPlaceholder, noVersions, createdBy,
restored, versionSaved, versionDeleted, labelUpdated
```
