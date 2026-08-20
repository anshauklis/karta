"""ClickHouse schema browser must list tables across all user databases.

Regression: with no schema, the default SQLAlchemy inspector saw only the
(empty) connection database, so the SQL Lab schema browser was blank.
"""
from api.engine_specs.clickhouse import _group_clickhouse_columns


_ROWS = [
    ("marts", "mart_ops_brand", "brand", "String"),
    ("marts", "mart_ops_brand", "revenue", "Nullable(Decimal(18, 2))"),
    ("ods", "users", "id", "UInt64"),
    ("ods", "users", "email", "Nullable(String)"),
]


def test_qualified_names_across_databases():
    out = _group_clickhouse_columns(_ROWS, qualified=True)
    names = [t["table_name"] for t in out]
    assert names == ["marts.mart_ops_brand", "ods.users"]
    revenue = out[0]["columns"][1]
    assert revenue["name"] == "revenue"
    assert revenue["nullable"] is True
    assert out[0]["columns"][0]["nullable"] is False  # plain String


def test_bare_names_for_single_schema():
    rows = [r for r in _ROWS if r[0] == "ods"]
    out = _group_clickhouse_columns(rows, qualified=False)
    assert [t["table_name"] for t in out] == ["users"]
    assert {c["name"] for c in out[0]["columns"]} == {"id", "email"}


def test_preserves_row_order():
    out = _group_clickhouse_columns(_ROWS, qualified=True)
    assert [c["name"] for c in out[0]["columns"]] == ["brand", "revenue"]
