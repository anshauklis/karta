"""Unit tests for pipeline_sql module — CTE pipeline builder."""

import pytest

from pipeline_sql import (
    build_pipeline_sql,
    _chart_filters_cte,
    _time_range_cte,
    _time_grain_cte,
)


# ---------------------------------------------------------------------------
# build_pipeline_sql
# ---------------------------------------------------------------------------


class TestBuildPipelineSql:
    def test_empty_config_base_cte_only(self):
        """Empty config produces base CTE only, SELECT * FROM _base."""
        sql, params = build_pipeline_sql("read_parquet('/tmp/data.parquet')", {})
        assert "_base AS (" in sql
        assert "SELECT * FROM read_parquet('/tmp/data.parquet')" in sql
        assert sql.strip().endswith("SELECT * FROM _base")
        assert params == {}

    def test_rls_conditions_added(self):
        """RLS conditions create _rls CTE with merged params."""
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')",
            {},
            rls_conditions=['"tenant_id" = $rls_0'],
            rls_params={"rls_0": 42},
        )
        assert "_rls AS (" in sql
        assert '"tenant_id" = $rls_0' in sql
        assert "SELECT * FROM _rls" in sql
        assert params == {"rls_0": 42}

    def test_dashboard_filters_added(self):
        """Dashboard filters create _dash CTE with merged params."""
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')",
            {},
            dash_where='"region" = $d_0',
            dash_params={"d_0": "US"},
        )
        assert "_dash AS (" in sql
        assert '"region" = $d_0' in sql
        assert sql.strip().endswith("SELECT * FROM _dash")
        assert params == {"d_0": "US"}

    def test_chart_filters_cte(self):
        """Chart filters produce _cf CTE."""
        config = {
            "chart_filters": [
                {"column": "status", "operator": "=", "value": "active"},
            ],
        }
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')", config
        )
        assert "_cf AS (" in sql
        assert '"status" = $_pcf_0' in sql
        assert params["_pcf_0"] == "active"

    def test_time_range_cte(self):
        """Time range config produces _tr CTE."""
        config = {
            "time_column": "created_at",
            "time_range": "30d",
        }
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')", config
        )
        assert "_tr AS (" in sql
        assert "INTERVAL '30 days'" in sql

    def test_time_grain_cte(self):
        """Time grain config produces _tg CTE with date_trunc."""
        config = {
            "time_column": "created_at",
            "time_grain": "month",
        }
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')", config
        )
        assert "_tg AS (" in sql
        assert "date_trunc('month'" in sql

    def test_metrics_cte(self):
        """Metrics config produces _met CTE with aggregation."""
        config = {
            "x_column": "category",
            "metrics": [
                {"column": "revenue", "aggregate": "SUM", "label": "Total Revenue"},
            ],
        }
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')", config
        )
        assert "_met AS (" in sql
        assert 'SUM("revenue") AS "Total Revenue"' in sql

    def test_skip_metrics_skips_calc_and_met(self):
        """skip_metrics=True skips _calc and _met CTEs."""
        config = {
            "metrics": [
                {"column": "revenue", "aggregate": "SUM", "label": "sum_rev"},
            ],
            "calculated_columns": [
                {"name": "profit", "expression": "revenue - cost"},
            ],
        }
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')",
            config,
            skip_metrics=True,
        )
        assert "_calc" not in sql
        assert "_met" not in sql

    def test_full_pipeline_cte_order(self):
        """Full pipeline verifies CTE order: _base -> _rls -> _dash -> _cf -> _tr -> _tg -> _met."""
        config = {
            "chart_filters": [
                {"column": "status", "operator": "=", "value": "active"},
            ],
            "time_column": "created_at",
            "time_range": "30d",
            "time_grain": "month",
            "x_column": "category",
            "metrics": [
                {"column": "revenue", "aggregate": "SUM", "label": "sum_rev"},
            ],
        }
        sql, params = build_pipeline_sql(
            "read_parquet('/tmp/data.parquet')",
            config,
            rls_conditions=['"tenant_id" = $rls_0'],
            rls_params={"rls_0": 1},
            dash_where='"region" = $d_0',
            dash_params={"d_0": "US"},
        )
        # Verify order by checking positions
        pos_base = sql.index("_base AS")
        pos_rls = sql.index("_rls AS")
        pos_dash = sql.index("_dash AS")
        pos_cf = sql.index("_cf AS")
        pos_tr = sql.index("_tr AS")
        pos_tg = sql.index("_tg AS")
        pos_met = sql.index("_met AS")
        assert pos_base < pos_rls < pos_dash < pos_cf < pos_tr < pos_tg < pos_met
        # Final SELECT reads from the last CTE
        assert sql.strip().endswith("SELECT * FROM _met")


# ---------------------------------------------------------------------------
# _chart_filters_cte
# ---------------------------------------------------------------------------


class TestChartFiltersCte:
    def test_equals_operator(self):
        """Equals operator produces '"col" = $param'."""
        config = {
            "chart_filters": [
                {"column": "status", "operator": "=", "value": "active"},
            ],
        }
        result = _chart_filters_cte(config, "_base", skip_metrics=False)
        assert result is not None
        cte, params = result
        assert '"status" = $_pcf_0' in cte
        assert params["_pcf_0"] == "active"

    def test_in_operator(self):
        """IN operator produces CAST("col" AS TEXT) IN ($p0, $p1)."""
        config = {
            "chart_filters": [
                {"column": "color", "operator": "IN", "value": "red, blue"},
            ],
        }
        result = _chart_filters_cte(config, "_base", skip_metrics=False)
        assert result is not None
        cte, params = result
        assert 'CAST("color" AS TEXT) IN' in cte
        assert "$_pcf_0_0" in cte
        assert "$_pcf_0_1" in cte
        assert params["_pcf_0_0"] == "red"
        assert params["_pcf_0_1"] == "blue"

    def test_is_null_operator(self):
        """IS NULL operator produces '"col" IS NULL' with no params."""
        config = {
            "chart_filters": [
                {"column": "deleted_at", "operator": "IS NULL"},
            ],
        }
        result = _chart_filters_cte(config, "_base", skip_metrics=False)
        assert result is not None
        cte, params = result
        assert '"deleted_at" IS NULL' in cte
        assert params == {}

    def test_skip_metrics_returns_none(self):
        """skip_metrics=True always returns None."""
        config = {
            "chart_filters": [
                {"column": "status", "operator": "=", "value": "active"},
            ],
        }
        result = _chart_filters_cte(config, "_base", skip_metrics=True)
        assert result is None

    def test_empty_filters_returns_none(self):
        """Empty chart_filters returns None."""
        result = _chart_filters_cte({"chart_filters": []}, "_base", skip_metrics=False)
        assert result is None

        result2 = _chart_filters_cte({}, "_base", skip_metrics=False)
        assert result2 is None


# ---------------------------------------------------------------------------
# _time_grain_cte
# ---------------------------------------------------------------------------


class TestTimeGrainCte:
    def test_month_grain(self):
        """Month grain produces date_trunc('month', ...)."""
        config = {
            "time_column": "created_at",
            "time_grain": "month",
        }
        result = _time_grain_cte(config, "_base", {})
        assert result is not None
        assert "date_trunc('month'" in result
        assert '"created_at"' in result

    def test_invalid_grain_returns_none(self):
        """Invalid grain (e.g. 'hourly') returns None."""
        config = {
            "time_column": "created_at",
            "time_grain": "hourly",
        }
        result = _time_grain_cte(config, "_base", {})
        assert result is None

    def test_raw_grain_returns_none(self):
        """'raw' grain returns None (no truncation needed)."""
        config = {
            "time_column": "created_at",
            "time_grain": "raw",
        }
        result = _time_grain_cte(config, "_base", {})
        assert result is None

    def test_no_time_column_returns_none(self):
        """No time_column in config returns None."""
        config = {
            "time_grain": "month",
        }
        result = _time_grain_cte(config, "_base", {})
        assert result is None
