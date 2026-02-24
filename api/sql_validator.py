import re


ALLOWED_FIRST_KEYWORDS = {"SELECT", "WITH"}

FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "CREATE", "GRANT", "REVOKE", "COPY", "EXECUTE", "CALL",
    "DO", "LOCK", "VACUUM", "REINDEX", "CLUSTER",
}

# Dangerous PostgreSQL functions that allow file/system access
FORBIDDEN_FUNCTIONS = {
    "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file",
    "lo_import", "lo_export", "lo_get", "lo_put",
    "dblink", "dblink_exec", "dblink_connect",
    "pg_execute_server_program",
}

_ALL_FORBIDDEN = FORBIDDEN_KEYWORDS | FORBIDDEN_FUNCTIONS

_FORBIDDEN_RE = re.compile(
    r"\b(?:" + "|".join(_ALL_FORBIDDEN) + r")\b",
    re.IGNORECASE,
)

# Match string literals (single-quoted, with '' escapes) for stripping
_STRING_LITERAL_RE = re.compile(r"'(?:[^']|'')*'")

MAX_LIMIT = 10000


class SQLValidationError(Exception):
    pass


def _strip_sql_comments(sql: str) -> str:
    """Remove SQL comments to prevent keyword bypass."""
    # Remove block comments /* ... */
    sql = re.sub(r'/\*.*?\*/', ' ', sql, flags=re.DOTALL)
    # Remove line comments -- ...
    sql = re.sub(r'--[^\n]*', ' ', sql)
    return sql


def _strip_string_literals(sql: str) -> str:
    """Replace string literals with placeholders to avoid false positives."""
    return _STRING_LITERAL_RE.sub("''", sql)


def validate_sql(sql: str, max_limit: int = MAX_LIMIT) -> str:
    """Validate and sanitize user SQL. Returns cleaned SQL with LIMIT."""
    sql = sql.strip().rstrip(";")
    if not sql:
        raise SQLValidationError("Empty query")

    # Strip comments for validation (preserve original for execution)
    stripped = _strip_sql_comments(sql)

    # Block semicolons in the middle of the query (prevent stacked queries)
    # Check after stripping comments but before stripping string literals
    clean_for_semi = _strip_string_literals(stripped)
    if ";" in clean_for_semi:
        raise SQLValidationError("Multiple statements (semicolons) are not allowed")

    first_word = stripped.split()[0].upper()
    if first_word not in ALLOWED_FIRST_KEYWORDS:
        raise SQLValidationError(f"Queries must start with SELECT or WITH, got: {first_word}")

    # Strip string literals before keyword checking to avoid false positives
    check_str = _strip_string_literals(stripped)
    match = _FORBIDDEN_RE.search(check_str)
    if match:
        raise SQLValidationError(f"Forbidden keyword: {match.group().upper()}")

    if max_limit > 0 and not re.search(r"\bLIMIT\b", stripped, re.IGNORECASE):
        sql = f"{sql}\nLIMIT {max_limit}"

    return sql
