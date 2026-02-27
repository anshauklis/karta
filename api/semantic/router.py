import logging

import api.json_util as json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user
from api.semantic.query_builder import build_semantic_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/semantic", tags=["semantic"])

# ---------------------------------------------------------------------------
# Column lists
# ---------------------------------------------------------------------------
_MODEL_COLS = """id, connection_id, name, description, source_type,
    source_table, source_sql, created_by, created_at, updated_at"""

_MEASURE_COLS = """id, model_id, name, label, description,
    expression, agg_type, format, filters, sort_order"""

_DIMENSION_COLS = """id, model_id, name, label, description,
    column_name, dimension_type, time_grain, format, sort_order"""

_JOIN_COLS = "id, from_model_id, to_model_id, join_type, from_column, to_column"


# ===== Models ==============================================================

@router.get("/models", summary="List semantic models")
def list_models(
    connection_id: int | None = None,
    current_user: dict = Depends(get_current_user),
):
    """List all semantic models, optionally filtered by connection_id."""
    params: dict = {}
    where = ""
    if connection_id is not None:
        where = " WHERE connection_id = :connection_id"
        params["connection_id"] = connection_id

    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_MODEL_COLS} FROM semantic_models{where} ORDER BY name"),
            params,
        )
        return [dict(r) for r in result.mappings().all()]


@router.post("/models", summary="Create semantic model", status_code=201)
def create_model(req: dict, current_user: dict = Depends(get_current_user)):
    """Create a new semantic model."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO semantic_models
                    (connection_id, name, description, source_type, source_table, source_sql, created_by)
                VALUES
                    (:connection_id, :name, :description, :source_type, :source_table, :source_sql, :created_by)
                RETURNING {_MODEL_COLS}
            """),
            {
                "connection_id": req.get("connection_id"),
                "name": req.get("name"),
                "description": req.get("description", ""),
                "source_type": req.get("source_type", "table"),
                "source_table": req.get("source_table"),
                "source_sql": req.get("source_sql"),
                "created_by": user_id,
            },
        )
        model = dict(result.mappings().fetchone())
        conn.commit()
    return model


@router.get("/models/{model_id}", summary="Get semantic model with measures, dimensions, and joins")
def get_model(model_id: int, current_user: dict = Depends(get_current_user)):
    """Return a single semantic model together with its measures, dimensions, and joins."""
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT {_MODEL_COLS} FROM semantic_models WHERE id = :id"),
            {"id": model_id},
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Semantic model not found")
        model = dict(row)

        measures = conn.execute(
            text(f"SELECT {_MEASURE_COLS} FROM model_measures WHERE model_id = :mid ORDER BY sort_order, id"),
            {"mid": model_id},
        )
        model["measures"] = [dict(r) for r in measures.mappings().all()]

        dimensions = conn.execute(
            text(f"SELECT {_DIMENSION_COLS} FROM model_dimensions WHERE model_id = :mid ORDER BY sort_order, id"),
            {"mid": model_id},
        )
        model["dimensions"] = [dict(r) for r in dimensions.mappings().all()]

        joins = conn.execute(
            text(f"""
                SELECT j.{_JOIN_COLS}, sm.name AS to_model_name
                FROM model_joins j
                JOIN semantic_models sm ON sm.id = j.to_model_id
                WHERE j.from_model_id = :mid
                ORDER BY j.id
            """),
            {"mid": model_id},
        )
        model["joins"] = [dict(r) for r in joins.mappings().all()]

    return model


@router.put("/models/{model_id}", summary="Update semantic model")
def update_model(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    """Update a semantic model's fields."""
    allowed = {"name", "description", "source_type", "source_table", "source_sql", "connection_id"}
    updates = {k: v for k, v in req.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = model_id

    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE semantic_models SET {set_clauses}, updated_at = NOW() WHERE id = :id RETURNING {_MODEL_COLS}"),
            updates,
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Semantic model not found")
        conn.commit()
    return dict(row)


@router.delete("/models/{model_id}", summary="Delete semantic model", status_code=204)
def delete_model(model_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a semantic model and all its measures, dimensions, and joins (CASCADE)."""
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM semantic_models WHERE id = :id RETURNING id"),
            {"id": model_id},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Semantic model not found")
        conn.commit()


# ===== Measures ============================================================

@router.post("/models/{model_id}/measures", summary="Add measure to model", status_code=201)
def create_measure(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    """Create a new measure on a semantic model."""
    with engine.connect() as conn:
        # Verify model exists
        exists = conn.execute(
            text("SELECT id FROM semantic_models WHERE id = :id"), {"id": model_id},
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Semantic model not found")

        result = conn.execute(
            text(f"""
                INSERT INTO model_measures
                    (model_id, name, label, description, expression, agg_type, format, filters, sort_order)
                VALUES
                    (:model_id, :name, :label, :description, :expression, :agg_type, :format,
                     CAST(:filters AS jsonb), :sort_order)
                RETURNING {_MEASURE_COLS}
            """),
            {
                "model_id": model_id,
                "name": req.get("name"),
                "label": req.get("label"),
                "description": req.get("description", ""),
                "expression": req.get("expression"),
                "agg_type": req.get("agg_type"),
                "format": req.get("format", ""),
                "filters": json.dumps(req.get("filters", [])),
                "sort_order": req.get("sort_order", 0),
            },
        )
        measure = dict(result.mappings().fetchone())
        conn.commit()
    return measure


@router.put("/measures/{measure_id}", summary="Update measure")
def update_measure(measure_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    """Update a measure's fields."""
    allowed = {"name", "label", "description", "expression", "agg_type", "format", "filters", "sort_order"}
    updates = {k: v for k, v in req.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Serialize filters JSONB
    if "filters" in updates:
        updates["filters"] = json.dumps(updates["filters"])

    set_parts = []
    for k in updates:
        if k == "filters":
            set_parts.append("filters = CAST(:filters AS jsonb)")
        else:
            set_parts.append(f"{k} = :{k}")

    updates["id"] = measure_id

    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE model_measures SET {', '.join(set_parts)} WHERE id = :id RETURNING {_MEASURE_COLS}"),
            updates,
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Measure not found")
        conn.commit()
    return dict(row)


@router.delete("/measures/{measure_id}", summary="Delete measure", status_code=204)
def delete_measure(measure_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a measure."""
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM model_measures WHERE id = :id RETURNING id"),
            {"id": measure_id},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Measure not found")
        conn.commit()


# ===== Dimensions ==========================================================

@router.post("/models/{model_id}/dimensions", summary="Add dimension to model", status_code=201)
def create_dimension(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    """Create a new dimension on a semantic model."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT id FROM semantic_models WHERE id = :id"), {"id": model_id},
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Semantic model not found")

        result = conn.execute(
            text(f"""
                INSERT INTO model_dimensions
                    (model_id, name, label, description, column_name, dimension_type, time_grain, format, sort_order)
                VALUES
                    (:model_id, :name, :label, :description, :column_name, :dimension_type,
                     :time_grain, :format, :sort_order)
                RETURNING {_DIMENSION_COLS}
            """),
            {
                "model_id": model_id,
                "name": req.get("name"),
                "label": req.get("label"),
                "description": req.get("description", ""),
                "column_name": req.get("column_name"),
                "dimension_type": req.get("dimension_type", "categorical"),
                "time_grain": req.get("time_grain"),
                "format": req.get("format", ""),
                "sort_order": req.get("sort_order", 0),
            },
        )
        dimension = dict(result.mappings().fetchone())
        conn.commit()
    return dimension


@router.put("/dimensions/{dimension_id}", summary="Update dimension")
def update_dimension(dimension_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    """Update a dimension's fields."""
    allowed = {"name", "label", "description", "column_name", "dimension_type", "time_grain", "format", "sort_order"}
    updates = {k: v for k, v in req.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = dimension_id

    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE model_dimensions SET {set_clauses} WHERE id = :id RETURNING {_DIMENSION_COLS}"),
            updates,
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Dimension not found")
        conn.commit()
    return dict(row)


@router.delete("/dimensions/{dimension_id}", summary="Delete dimension", status_code=204)
def delete_dimension(dimension_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a dimension."""
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM model_dimensions WHERE id = :id RETURNING id"),
            {"id": dimension_id},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Dimension not found")
        conn.commit()


# ===== Joins ===============================================================

@router.post("/models/{model_id}/joins", summary="Add join to model", status_code=201)
def create_join(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    """Create a join relationship from this model to another model."""
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT id FROM semantic_models WHERE id = :id"), {"id": model_id},
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Source semantic model not found")

        to_exists = conn.execute(
            text("SELECT id FROM semantic_models WHERE id = :id"), {"id": req.get("to_model_id")},
        ).fetchone()
        if not to_exists:
            raise HTTPException(status_code=404, detail="Target semantic model not found")

        result = conn.execute(
            text(f"""
                INSERT INTO model_joins
                    (from_model_id, to_model_id, join_type, from_column, to_column)
                VALUES
                    (:from_model_id, :to_model_id, :join_type, :from_column, :to_column)
                RETURNING {_JOIN_COLS}
            """),
            {
                "from_model_id": model_id,
                "to_model_id": req.get("to_model_id"),
                "join_type": req.get("join_type", "left"),
                "from_column": req.get("from_column"),
                "to_column": req.get("to_column"),
            },
        )
        join_row = dict(result.mappings().fetchone())
        conn.commit()
    return join_row


@router.delete("/joins/{join_id}", summary="Delete join", status_code=204)
def delete_join(join_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a join relationship."""
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM model_joins WHERE id = :id RETURNING id"),
            {"id": join_id},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Join not found")
        conn.commit()


# ===== Query ===============================================================

@router.post("/query", summary="Execute semantic query")
async def semantic_query(req: dict, current_user: dict = Depends(get_current_user)):
    """Build SQL from a semantic model definition and execute it.

    Request body::

        {
            "model_id": 1,
            "measures": ["revenue", "order_count"],
            "dimensions": ["region", "order_date"],
            "filters": [{"dimension": "region", "operator": "=", "value": "US"}],
            "order_by": "revenue DESC",
            "limit": 100
        }

    Returns ``{"sql": "...", "data": {"columns": [...], "rows": [...], "row_count": N}}``.
    """
    model_id = req.get("model_id")
    if not model_id:
        raise HTTPException(status_code=400, detail="model_id is required")

    measure_names = req.get("measures", [])
    dimension_names = req.get("dimensions", [])
    filters = req.get("filters")
    order_by = req.get("order_by")
    limit = req.get("limit")

    # Build the SQL from semantic definitions
    try:
        sql = build_semantic_query(
            model_id=model_id,
            measure_names=measure_names,
            dimension_names=dimension_names,
            filters=filters,
            order_by=order_by,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Look up connection_id for this model
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT connection_id FROM semantic_models WHERE id = :id"),
            {"id": model_id},
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Semantic model not found")
        connection_id = row["connection_id"]

    # Execute against the model's connection
    from api.ai.tools import execute_sql as ai_execute_sql

    result = await ai_execute_sql(connection_id, sql)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {"sql": sql, "data": result}
