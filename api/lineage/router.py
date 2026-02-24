from fastapi import APIRouter, Depends
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user
from api.models import LineageResponse

router = APIRouter(tags=["lineage"])


@router.get("/api/lineage", response_model=LineageResponse, summary="Get data lineage graph")
def get_lineage(current_user: dict = Depends(get_current_user)):
    """Build and return a directed graph of connections, datasets, charts, dashboards, reports, and alerts."""
    nodes = []
    edges = []
    seen = set()

    with engine.connect() as conn:
        # Connections
        for r in conn.execute(text("SELECT id, name FROM connections")).mappings().all():
            nid = f"conn-{r['id']}"
            nodes.append({"id": nid, "type": "connection", "name": r["name"], "meta": {"db_id": r["id"]}})
            seen.add(nid)

        # Dashboards
        for r in conn.execute(text("SELECT id, title, url_slug FROM dashboards WHERE is_archived = false")).mappings().all():
            nid = f"dash-{r['id']}"
            nodes.append({"id": nid, "type": "dashboard", "name": r["title"], "meta": {"slug": r["url_slug"]}})
            seen.add(nid)

        # Charts
        for r in conn.execute(text("SELECT id, title, connection_id, dashboard_id, dataset_id FROM charts")).mappings().all():
            nid = f"chart-{r['id']}"
            nodes.append({"id": nid, "type": "chart", "name": r["title"], "meta": {"db_id": r["id"]}})
            seen.add(nid)
            if r["connection_id"]:
                edges.append({"source": f"conn-{r['connection_id']}", "target": nid})
            if r["dataset_id"]:
                edges.append({"source": f"dataset-{r['dataset_id']}", "target": nid})
            if r["dashboard_id"]:
                edges.append({"source": nid, "target": f"dash-{r['dashboard_id']}"})

        # Datasets
        for r in conn.execute(text("SELECT id, name, connection_id FROM datasets")).mappings().all():
            nid = f"dataset-{r['id']}"
            nodes.append({"id": nid, "type": "dataset", "name": r["name"], "meta": {"db_id": r["id"]}})
            seen.add(nid)
            if r["connection_id"]:
                edges.append({"source": f"conn-{r['connection_id']}", "target": nid})

        # Reports
        for r in conn.execute(text("SELECT id, name, chart_id FROM scheduled_reports")).mappings().all():
            nid = f"report-{r['id']}"
            nodes.append({"id": nid, "type": "report", "name": r["name"], "meta": {"db_id": r["id"]}})
            seen.add(nid)
            if r["chart_id"]:
                edges.append({"source": f"chart-{r['chart_id']}", "target": nid})

        # Alerts
        for r in conn.execute(text("SELECT id, name, connection_id FROM alert_rules")).mappings().all():
            nid = f"alert-{r['id']}"
            nodes.append({"id": nid, "type": "alert", "name": r["name"], "meta": {"db_id": r["id"]}})
            seen.add(nid)
            if r["connection_id"]:
                edges.append({"source": f"conn-{r['connection_id']}", "target": nid})

    # Filter edges to only include nodes that exist
    edges = [e for e in edges if e["source"] in seen and e["target"] in seen]

    return {"nodes": nodes, "edges": edges}
