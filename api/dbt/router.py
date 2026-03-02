import api.json_util as json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile, Form
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import require_role
from api.dbt.parser import parse_manifest

router = APIRouter(prefix="/api/datasets", tags=["dbt"])


@router.post("/preview-dbt", summary="Preview dbt models from manifest")
async def preview_dbt(
    manifest: UploadFile,
    connection_id: int = Form(...),
    current_user: dict = require_role("editor", "admin"),
):
    """Parse manifest.json and return model list for preview."""
    try:
        raw = await manifest.read()
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid manifest.json file")

    models = parse_manifest(data)
    if not models:
        return {"models": []}

    # Check which models already exist in Karta by dbt_unique_id
    unique_ids = [m.unique_id for m in models]
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT metadata->>'dbt_unique_id' AS uid
                FROM datasets
                WHERE metadata->>'dbt_unique_id' = ANY(:uids)
            """),
            {"uids": unique_ids},
        )
        existing = {r.uid for r in rows}

    return {
        "models": [
            {
                "unique_id": m.unique_id,
                "name": m.name,
                "schema": m.schema,
                "description": m.description,
                "columns_count": len(m.columns),
                "columns": m.columns,
                "tags": m.tags,
                "materialized": m.materialized,
                "exists_in_karta": m.unique_id in existing,
            }
            for m in models
        ]
    }


@router.post("/import-dbt", summary="Import dbt models as datasets")
async def import_dbt(
    manifest: UploadFile,
    connection_id: int = Form(...),
    selected_models: str = Form(...),
    current_user: dict = require_role("editor", "admin"),
):
    """Parse manifest.json, create or update datasets for selected models."""
    try:
        raw = await manifest.read()
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid manifest.json file")

    try:
        selected_ids = json.loads(selected_models)
        if not isinstance(selected_ids, list):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="selected_models must be a JSON array of unique_ids")

    if not selected_ids:
        raise HTTPException(status_code=400, detail="No models selected")

    models = parse_manifest(data)
    selected_map = {m.unique_id: m for m in models if m.unique_id in selected_ids}

    if not selected_map:
        raise HTTPException(status_code=400, detail="None of the selected models found in manifest")

    user_id = int(current_user["sub"])
    now = datetime.now(timezone.utc).isoformat()
    results = []

    with engine.connect() as conn:
        for uid, model in selected_map.items():
            sql_query = f"SELECT * FROM {model.relation_name}"
            metadata = json.dumps({
                "dbt_unique_id": model.unique_id,
                "dbt_tags": model.tags,
                "dbt_materialized": model.materialized,
                "dbt_columns": model.columns,
                "imported_at": now,
            })

            # Check if dataset with this dbt_unique_id already exists
            existing = conn.execute(
                text("""
                    SELECT id FROM datasets
                    WHERE metadata->>'dbt_unique_id' = :uid
                """),
                {"uid": uid},
            ).fetchone()

            if existing:
                conn.execute(
                    text("""
                        UPDATE datasets
                        SET name = :name, description = :description,
                            sql_query = :sql_query, connection_id = :connection_id,
                            metadata = :metadata, updated_at = NOW()
                        WHERE id = :id
                    """),
                    {
                        "name": model.name,
                        "description": model.description,
                        "sql_query": sql_query,
                        "connection_id": connection_id,
                        "metadata": metadata,
                        "id": existing.id,
                    },
                )
                results.append({"id": existing.id, "name": model.name, "action": "updated"})
            else:
                row = conn.execute(
                    text("""
                        INSERT INTO datasets (connection_id, name, description, sql_query,
                            cache_ttl, metadata, created_by)
                        VALUES (:connection_id, :name, :description, :sql_query,
                            600, :metadata, :created_by)
                        RETURNING id
                    """),
                    {
                        "connection_id": connection_id,
                        "name": model.name,
                        "description": model.description,
                        "sql_query": sql_query,
                        "metadata": metadata,
                        "created_by": user_id,
                    },
                )
                dataset_id = row.scalar()
                results.append({"id": dataset_id, "name": model.name, "action": "created"})

        conn.commit()

    imported = sum(1 for r in results if r["action"] == "created")
    updated = sum(1 for r in results if r["action"] == "updated")

    return {
        "imported": imported,
        "updated": updated,
        "skipped": len(selected_ids) - len(results),
        "datasets": results,
    }
