"""Tests for sql_validator module."""

import pytest

from sql_validator import SQLValidationError, validate_sql, validate_sql_expression


# ---------------------------------------------------------------------------
# 1. Valid queries
# ---------------------------------------------------------------------------


class TestValidQueries:
    """validate_sql should accept and return well-formed SELECT/WITH queries."""

    def test_simple_select(self):
        result = validate_sql("SELECT 1")
        assert "SELECT 1" in result

    def test_select_from_table(self):
        result = validate_sql("SELECT * FROM users")
        assert "SELECT * FROM users" in result

    def test_with_cte(self):
        sql = "WITH cte AS (SELECT 1) SELECT * FROM cte"
        result = validate_sql(sql)
        assert "WITH cte" in result

    def test_preserves_existing_limit(self):
        sql = "SELECT * FROM t LIMIT 50"
        result = validate_sql(sql)
        assert result == sql  # no extra LIMIT appended

    def test_auto_appends_limit(self):
        result = validate_sql("SELECT * FROM t")
        assert result.endswith("LIMIT 10000")

    def test_custom_max_limit(self):
        result = validate_sql("SELECT * FROM t", max_limit=500)
        assert "LIMIT 500" in result

    def test_max_limit_zero_no_limit_appended(self):
        result = validate_sql("SELECT * FROM t", max_limit=0)
        assert "LIMIT" not in result

    def test_whitespace_stripping(self):
        result = validate_sql("   SELECT 1   ")
        assert "SELECT 1" in result

    def test_trailing_semicolon_stripped(self):
        result = validate_sql("SELECT 1;")
        assert "SELECT 1" in result
        assert ";" not in result

    def test_case_insensitive_select(self):
        result = validate_sql("select id from users")
        assert "select id from users" in result

    def test_case_insensitive_limit_preserved(self):
        sql = "SELECT * FROM t limit 25"
        result = validate_sql(sql)
        # existing lowercase LIMIT should be detected and not duplicated
        assert result == sql


# ---------------------------------------------------------------------------
# 2. Blocked queries
# ---------------------------------------------------------------------------


class TestBlockedQueries:
    """validate_sql should reject dangerous or malformed queries."""

    def test_empty_query(self):
        with pytest.raises(SQLValidationError, match="Empty query"):
            validate_sql("")

    def test_whitespace_only_query(self):
        with pytest.raises(SQLValidationError, match="Empty query"):
            validate_sql("   ")

    def test_semicolon_only(self):
        with pytest.raises(SQLValidationError, match="Empty query"):
            validate_sql(";")

    def test_insert(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT or WITH"):
            validate_sql("INSERT INTO t VALUES (1)")

    def test_update(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT or WITH"):
            validate_sql("UPDATE t SET x = 1")

    def test_delete(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT or WITH"):
            validate_sql("DELETE FROM t")

    def test_drop(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT or WITH"):
            validate_sql("DROP TABLE t")

    def test_stacked_queries_semicolon(self):
        with pytest.raises(SQLValidationError, match="semicolons"):
            validate_sql("SELECT 1; DROP TABLE t")

    def test_forbidden_keyword_in_subquery(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT * FROM t WHERE x IN (DELETE FROM t2)")

    def test_forbidden_truncate(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT or WITH"):
            validate_sql("TRUNCATE t")


# ---------------------------------------------------------------------------
# 3. Bypass attempts
# ---------------------------------------------------------------------------


class TestBypassAttempts:
    """Ensure comment/string stripping prevents false positives and bypasses."""

    def test_keyword_inside_string_literal_allowed(self):
        # 'DROP' is inside a string literal, should NOT trigger rejection
        sql = "SELECT 'DROP TABLE t' AS label FROM users"
        result = validate_sql(sql)
        assert "SELECT" in result

    def test_keyword_inside_comment_stripped(self):
        # The comment is stripped, so the real body is just SELECT 1
        sql = "SELECT 1 /* DROP TABLE t */"
        result = validate_sql(sql)
        assert "SELECT 1" in result

    def test_keyword_in_line_comment_stripped(self):
        sql = "SELECT 1 -- DROP TABLE t"
        result = validate_sql(sql)
        assert "SELECT 1" in result

    def test_forbidden_keyword_after_comment_strip(self):
        # Comment is stripped, but the real query still contains forbidden word
        sql = "SELECT 1; /* safe */ DELETE FROM t"
        with pytest.raises(SQLValidationError, match="semicolons"):
            validate_sql(sql)


# ---------------------------------------------------------------------------
# 4. Dangerous functions
# ---------------------------------------------------------------------------


class TestDangerousFunctions:
    """Forbidden PostgreSQL functions must be blocked."""

    def test_pg_read_file(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT pg_read_file('/etc/passwd')")

    def test_dblink(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT * FROM dblink('host=evil', 'SELECT 1')")

    def test_lo_export(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT lo_export(12345, '/tmp/out')")

    def test_lo_import(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT lo_import('/etc/passwd')")

    def test_dblink_exec(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT dblink_exec('DROP TABLE t')")


# ---------------------------------------------------------------------------
# 5. Expression validation
# ---------------------------------------------------------------------------


class TestExpressionValidation:
    """validate_sql_expression validates fragments used in WHERE/GROUP BY etc."""

    def test_valid_expression(self):
        result = validate_sql_expression("column_name > 5")
        assert result == "column_name > 5"

    def test_valid_function_call(self):
        result = validate_sql_expression("UPPER(name)")
        assert result == "UPPER(name)"

    def test_empty_expression(self):
        with pytest.raises(SQLValidationError, match="Empty expression"):
            validate_sql_expression("")

    def test_semicolon_in_expression(self):
        with pytest.raises(SQLValidationError, match="Semicolons are not allowed"):
            validate_sql_expression("x = 1; DROP TABLE t")

    def test_subquery_blocked(self):
        with pytest.raises(SQLValidationError, match="Subqueries are not allowed"):
            validate_sql_expression("(SELECT max(id) FROM t)")

    def test_forbidden_keyword_in_expression(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql_expression("DELETE FROM t")

    def test_keyword_in_string_literal_allowed(self):
        result = validate_sql_expression("name = 'DELETE'")
        assert result == "name = 'DELETE'"

    def test_whitespace_stripping(self):
        result = validate_sql_expression("  col + 1  ")
        assert result == "col + 1"
