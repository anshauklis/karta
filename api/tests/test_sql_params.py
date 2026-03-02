"""Unit tests for sql_params module — extract_variables and substitute."""

import pytest

from sql_params import extract_variables, substitute


# ---------------------------------------------------------------------------
# extract_variables
# ---------------------------------------------------------------------------


class TestExtractVariables:
    def test_single_variable(self):
        assert extract_variables("SELECT * FROM t WHERE id = {{ id }}") == ["id"]

    def test_multiple_variables(self):
        sql = "SELECT * FROM t WHERE a = {{ x }} AND b = {{ y }}"
        assert extract_variables(sql) == ["x", "y"]

    def test_duplicates_deduplicated(self):
        sql = "{{ col }} + {{ col }}"
        assert extract_variables(sql) == ["col"]

    def test_order_preserved(self):
        sql = "{{ b }} {{ a }} {{ c }} {{ a }}"
        assert extract_variables(sql) == ["b", "a", "c"]

    def test_no_variables_returns_empty(self):
        assert extract_variables("SELECT 1") == []

    def test_underscore_and_digits_in_names(self):
        sql = "{{ my_var2 }} {{ _leading }}"
        assert extract_variables(sql) == ["my_var2", "_leading"]

    def test_no_whitespace_inside_braces(self):
        assert extract_variables("{{x}}") == ["x"]

    def test_extra_whitespace_inside_braces(self):
        assert extract_variables("{{  x  }}") == ["x"]


# ---------------------------------------------------------------------------
# substitute
# ---------------------------------------------------------------------------


class TestSubstitute:
    def test_text_value_quoted(self):
        result = substitute("{{ name }}", {"name": "Alice"})
        assert result == "'Alice'"

    def test_number_value_unquoted(self):
        result = substitute(
            "{{ x }}",
            {"x": "42"},
            var_types={"x": "number"},
        )
        assert result == "42"

    def test_date_value_quoted(self):
        result = substitute("{{ d }}", {"d": "2024-01-15"})
        assert result == "'2024-01-15'"

    def test_single_quote_escaping(self):
        result = substitute("{{ name }}", {"name": "O'Brien"})
        assert result == "'O''Brien'"

    def test_missing_variable_raises(self):
        with pytest.raises(ValueError, match="no value and no default"):
            substitute("{{ missing }}", {})

    def test_default_used_when_value_absent(self):
        result = substitute(
            "{{ color }}",
            {},
            defaults={"color": "red"},
        )
        assert result == "'red'"

    def test_explicit_value_overrides_default(self):
        result = substitute(
            "{{ color }}",
            {"color": "blue"},
            defaults={"color": "red"},
        )
        assert result == "'blue'"

    def test_invalid_number_raises(self):
        with pytest.raises(ValueError, match="not a valid number"):
            substitute("{{ x }}", {"x": "abc"}, var_types={"x": "number"})

    def test_nan_rejected(self):
        with pytest.raises(ValueError, match="not a finite number"):
            substitute("{{ x }}", {"x": "nan"}, var_types={"x": "number"})

    def test_inf_rejected(self):
        with pytest.raises(ValueError, match="not a finite number"):
            substitute("{{ x }}", {"x": "inf"}, var_types={"x": "number"})

    def test_multiple_substitutions(self):
        sql = "SELECT * FROM t WHERE a = {{ x }} AND b = {{ y }}"
        result = substitute(sql, {"x": "hello", "y": "world"})
        assert result == "SELECT * FROM t WHERE a = 'hello' AND b = 'world'"
