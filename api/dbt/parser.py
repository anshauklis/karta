from dataclasses import dataclass


@dataclass
class DbtModel:
    unique_id: str
    name: str
    schema: str
    database: str | None
    relation_name: str
    description: str
    columns: list[dict]  # [{"name": "col", "description": "...", "data_type": "int"}]
    tags: list[str]
    materialized: str


def parse_manifest(data: dict) -> list[DbtModel]:
    """Extract models from manifest.json nodes dict."""
    models = []
    for node_id, node in data.get("nodes", {}).items():
        if node.get("resource_type") != "model":
            continue
        columns = []
        for col_name, col_data in node.get("columns", {}).items():
            columns.append({
                "name": col_data.get("name", col_name),
                "description": col_data.get("description", ""),
                "data_type": col_data.get("data_type", ""),
            })
        models.append(DbtModel(
            unique_id=node["unique_id"],
            name=node["name"],
            schema=node.get("schema", "public"),
            database=node.get("database"),
            relation_name=node.get("relation_name") or f'"{node.get("schema", "public")}"."{node["name"]}"',
            description=node.get("description", ""),
            columns=columns,
            tags=node.get("tags", []),
            materialized=node.get("config", {}).get("materialized", "view"),
        ))
    return models
