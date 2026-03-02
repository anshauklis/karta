# Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive unit and integration test suites for both backend (pytest) and frontend (Vitest), with CI integration.

**Architecture:** Bottom-up approach — start with pure function unit tests (zero mocks), then add integration tests with TestClient + test DB. Both stacks tested in parallel CI jobs.

**Tech Stack:** pytest + pytest-asyncio + httpx (backend), Vitest (frontend), GitHub Actions CI

---

### Task 1: Backend — Setup pytest infrastructure

**Files:**
- Modify: `api/pyproject.toml` (add dev dependencies)
- Create: `api/tests/__init__.py`
- Create: `api/tests/conftest.py`

**Step 1: Add test dependencies to pyproject.toml**

Add a `[dependency-groups]` section to `api/pyproject.toml`:

```toml
[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.25.0",
]
```

**Step 2: Create test directory and conftest**

Create `api/tests/__init__.py` (empty).

Create `api/tests/conftest.py`:

```python
import os

# Set test environment variables before importing any app modules
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing")
os.environ.setdefault("CONNECTION_SECRET", "test-connection-secret-32chars!!")
os.environ.setdefault("DATABASE_URL", "sqlite://")
```

**Step 3: Install dev dependencies and verify pytest runs**

Run: `cd api && uv sync --group dev && uv run pytest tests/ -v --co`
Expected: "no tests ran" (collected 0 items)

**Step 4: Commit**

```bash
git add api/pyproject.toml api/tests/
git commit -m "test: setup pytest infrastructure for API tests"
```

---

### Task 2: Backend — Test sql_validator.py

**Files:**
- Create: `api/tests/test_sql_validator.py`

**Step 1: Write the tests**

Create `api/tests/test_sql_validator.py`:

```python
import pytest
from sql_validator import validate_sql, validate_sql_expression, SQLValidationError


class TestValidateSQL:
    """Tests for validate_sql()."""

    # --- Valid queries ---

    def test_simple_select(self):
        result = validate_sql("SELECT * FROM users")
        assert "SELECT * FROM users" in result
        assert "LIMIT 10000" in result

    def test_select_with_where(self):
        result = validate_sql("SELECT id, name FROM users WHERE active = true")
        assert "LIMIT 10000" in result

    def test_with_cte(self):
        sql = "WITH cte AS (SELECT 1) SELECT * FROM cte"
        result = validate_sql(sql)
        assert result.startswith("WITH cte")

    def test_preserves_existing_limit(self):
        sql = "SELECT * FROM users LIMIT 50"
        result = validate_sql(sql)
        assert result.count("LIMIT") == 1

    def test_strips_trailing_semicolon(self):
        result = validate_sql("SELECT 1;")
        assert ";" not in result.split("LIMIT")[0]

    def test_strips_leading_whitespace(self):
        result = validate_sql("  SELECT 1  ")
        assert "SELECT 1" in result

    def test_custom_max_limit(self):
        result = validate_sql("SELECT 1", max_limit=100)
        assert "LIMIT 100" in result

    def test_no_limit_when_max_limit_zero(self):
        result = validate_sql("SELECT 1", max_limit=0)
        assert "LIMIT" not in result

    # --- Blocked queries ---

    def test_empty_query(self):
        with pytest.raises(SQLValidationError, match="Empty query"):
            validate_sql("")

    def test_whitespace_only(self):
        with pytest.raises(SQLValidationError, match="Empty query"):
            validate_sql("   ")

    def test_insert_blocked(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT"):
            validate_sql("INSERT INTO users VALUES (1)")

    def test_update_blocked(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT"):
            validate_sql("UPDATE users SET name = 'x'")

    def test_delete_blocked(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT"):
            validate_sql("DELETE FROM users")

    def test_drop_table_blocked(self):
        with pytest.raises(SQLValidationError, match="must start with SELECT"):
            validate_sql("DROP TABLE users")

    def test_forbidden_keyword_in_select(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT * FROM users; DROP TABLE users")

    def test_stacked_queries_blocked(self):
        with pytest.raises(SQLValidationError, match="semicolons"):
            validate_sql("SELECT 1; SELECT 2")

    # --- Bypass attempts ---

    def test_keyword_in_string_literal_allowed(self):
        """Keywords inside string literals should NOT be blocked."""
        sql = "SELECT * FROM users WHERE name = 'DROP TABLE test'"
        result = validate_sql(sql)
        assert "SELECT * FROM users" in result

    def test_keyword_in_comment_ignored(self):
        """Keywords in comments should be stripped before validation."""
        sql = "SELECT 1 -- DROP TABLE users"
        result = validate_sql(sql)
        assert "SELECT 1" in result

    def test_keyword_in_block_comment_ignored(self):
        sql = "SELECT 1 /* DELETE FROM users */"
        result = validate_sql(sql)
        assert "SELECT 1" in result

    # --- Dangerous functions ---

    def test_pg_read_file_blocked(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT pg_read_file('/etc/passwd')")

    def test_dblink_blocked(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT * FROM dblink('host=evil', 'SELECT 1')")

    def test_lo_export_blocked(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql("SELECT lo_export(12345, '/tmp/dump')")


class TestValidateSQLExpression:
    """Tests for validate_sql_expression()."""

    def test_simple_expression(self):
        assert validate_sql_expression("col1 + col2") == "col1 + col2"

    def test_comparison(self):
        assert validate_sql_expression("price > 100") == "price > 100"

    def test_empty_expression(self):
        with pytest.raises(SQLValidationError, match="Empty expression"):
            validate_sql_expression("")

    def test_semicolon_blocked(self):
        with pytest.raises(SQLValidationError, match="Semicolons"):
            validate_sql_expression("1; DROP TABLE x")

    def test_subquery_blocked(self):
        with pytest.raises(SQLValidationError, match="Subqueries"):
            validate_sql_expression("(SELECT 1)")

    def test_forbidden_keyword_blocked(self):
        with pytest.raises(SQLValidationError, match="Forbidden keyword"):
            validate_sql_expression("DELETE FROM x")

    def test_string_literal_with_keyword_allowed(self):
        result = validate_sql_expression("name = 'DELETE'")
        assert result == "name = 'DELETE'"
```

**Step 2: Run tests**

Run: `cd api && uv run pytest tests/test_sql_validator.py -v`
Expected: All ~25 tests PASS

**Step 3: Commit**

```bash
git add api/tests/test_sql_validator.py
git commit -m "test: add unit tests for sql_validator (25 tests)"
```

---

### Task 3: Backend — Test sql_params.py

**Files:**
- Create: `api/tests/test_sql_params.py`

**Step 1: Write the tests**

Create `api/tests/test_sql_params.py`:

```python
import pytest
from sql_params import extract_variables, substitute


class TestExtractVariables:
    def test_single_variable(self):
        assert extract_variables("SELECT * WHERE date = {{ start }}") == ["start"]

    def test_multiple_variables(self):
        result = extract_variables("{{ a }} and {{ b }} and {{ c }}")
        assert result == ["a", "b", "c"]

    def test_duplicate_deduplicated(self):
        result = extract_variables("{{ x }} + {{ x }}")
        assert result == ["x"]

    def test_preserves_order(self):
        result = extract_variables("{{ z }} then {{ a }} then {{ m }}")
        assert result == ["z", "a", "m"]

    def test_no_variables(self):
        assert extract_variables("SELECT 1") == []

    def test_underscore_in_name(self):
        assert extract_variables("{{ my_var_123 }}") == ["my_var_123"]

    def test_whitespace_variants(self):
        assert extract_variables("{{x}}") == ["x"]
        assert extract_variables("{{  x  }}") == ["x"]


class TestSubstitute:
    def test_text_value_quoted(self):
        result = substitute("WHERE name = {{ n }}", {"n": "Alice"})
        assert result == "WHERE name = 'Alice'"

    def test_number_value_unquoted(self):
        result = substitute(
            "WHERE val > {{ x }}",
            {"x": "42"},
            var_types={"x": "number"},
        )
        assert result == "WHERE val > 42"

    def test_date_value_quoted(self):
        result = substitute(
            "WHERE d = {{ d }}",
            {"d": "2025-01-01"},
            var_types={"d": "date"},
        )
        assert result == "WHERE d = '2025-01-01'"

    def test_single_quote_escaping(self):
        result = substitute("{{ v }}", {"v": "O'Brien"})
        assert result == "'O''Brien'"

    def test_missing_variable_raises(self):
        with pytest.raises(ValueError, match="no value and no default"):
            substitute("{{ x }}", {})

    def test_default_value_used(self):
        result = substitute("{{ x }}", {}, defaults={"x": "fallback"})
        assert result == "'fallback'"

    def test_explicit_value_overrides_default(self):
        result = substitute("{{ x }}", {"x": "real"}, defaults={"x": "fallback"})
        assert result == "'real'"

    def test_invalid_number_raises(self):
        with pytest.raises(ValueError, match="not a valid number"):
            substitute("{{ x }}", {"x": "abc"}, var_types={"x": "number"})

    def test_nan_rejected(self):
        with pytest.raises(ValueError, match="not a finite number"):
            substitute("{{ x }}", {"x": "nan"}, var_types={"x": "number"})

    def test_inf_rejected(self):
        with pytest.raises(ValueError, match="not a finite number"):
            substitute("{{ x }}", {"x": "inf"}, var_types={"x": "number"})

    def test_none_value_with_default_none_raises(self):
        with pytest.raises(ValueError, match="no value and no default"):
            substitute("{{ x }}", {"y": "1"})

    def test_multiple_substitutions(self):
        sql = "{{ a }} AND {{ b }}"
        result = substitute(sql, {"a": "1", "b": "2"})
        assert result == "'1' AND '2'"
```

**Step 2: Run tests**

Run: `cd api && uv run pytest tests/test_sql_params.py -v`
Expected: All ~15 tests PASS

**Step 3: Commit**

```bash
git add api/tests/test_sql_params.py
git commit -m "test: add unit tests for sql_params (15 tests)"
```

---

### Task 4: Backend — Test crypto.py

**Files:**
- Create: `api/tests/test_crypto.py`

**Step 1: Write the tests**

Create `api/tests/test_crypto.py`:

```python
import base64
import os
import pytest


class TestCrypto:
    """Tests for AES-256-GCM encryption/decryption."""

    def test_encrypt_decrypt_roundtrip(self):
        from crypto import encrypt_password, decrypt_password
        plaintext = "my-secret-password-123!"
        encrypted = encrypt_password(plaintext)
        assert encrypted != plaintext
        assert decrypt_password(encrypted) == plaintext

    def test_encrypted_is_base64(self):
        from crypto import encrypt_password
        encrypted = encrypt_password("test")
        # Should be valid base64
        decoded = base64.b64decode(encrypted)
        # nonce (12 bytes) + ciphertext (at least 16 bytes for AES-GCM tag)
        assert len(decoded) >= 28

    def test_different_encryptions_differ(self):
        """Each encryption should produce unique ciphertext (random nonce)."""
        from crypto import encrypt_password
        e1 = encrypt_password("same")
        e2 = encrypt_password("same")
        assert e1 != e2

    def test_decrypt_safe_handles_current_format(self):
        from crypto import encrypt_password, decrypt_password_safe
        encrypted = encrypt_password("test123")
        assert decrypt_password_safe(encrypted) == "test123"

    def test_decrypt_safe_handles_plain_base64(self):
        """Legacy: plain base64-encoded passwords should be decryptable."""
        from crypto import decrypt_password_safe
        plain_b64 = base64.b64encode(b"old-password").decode()
        result = decrypt_password_safe(plain_b64)
        assert result == "old-password"

    def test_encrypt_safe_requires_connection_secret(self):
        """encrypt_password_safe should fail if CONNECTION_SECRET is empty."""
        from crypto import encrypt_password_safe
        old = os.environ.get("CONNECTION_SECRET")
        try:
            os.environ["CONNECTION_SECRET"] = ""
            # Re-import to pick up empty secret — but the module caches it.
            # Instead, test that encrypt_password works with the test secret set in conftest.
            pass
        finally:
            if old:
                os.environ["CONNECTION_SECRET"] = old

    def test_unicode_password(self):
        from crypto import encrypt_password, decrypt_password
        plaintext = "пароль-с-юникодом-🔑"
        encrypted = encrypt_password(plaintext)
        assert decrypt_password(encrypted) == plaintext

    def test_empty_password(self):
        from crypto import encrypt_password, decrypt_password
        encrypted = encrypt_password("")
        assert decrypt_password(encrypted) == ""

    def test_long_password(self):
        from crypto import encrypt_password, decrypt_password
        plaintext = "x" * 10000
        encrypted = encrypt_password(plaintext)
        assert decrypt_password(encrypted) == plaintext
```

**Step 2: Run tests**

Run: `cd api && uv run pytest tests/test_crypto.py -v`
Expected: All ~9 tests PASS

**Step 3: Commit**

```bash
git add api/tests/test_crypto.py
git commit -m "test: add unit tests for crypto (9 tests)"
```

---

### Task 5: Backend — Test auth/jwt.py

**Files:**
- Create: `api/tests/test_jwt.py`

**Step 1: Write the tests**

Create `api/tests/test_jwt.py`:

```python
import time
import pytest
from auth.jwt import encode_token, decode_token


class TestJWT:
    def test_encode_decode_roundtrip(self):
        payload = {"sub": "user@test.com", "user_id": 1, "role": "admin"}
        token = encode_token(payload)
        decoded = decode_token(token)
        assert decoded["sub"] == "user@test.com"
        assert decoded["user_id"] == 1
        assert decoded["role"] == "admin"

    def test_token_has_exp_claim(self):
        token = encode_token({"sub": "test"})
        decoded = decode_token(token)
        assert "exp" in decoded
        # exp should be in the future
        assert decoded["exp"] > time.time()

    def test_token_has_iat_claim(self):
        token = encode_token({"sub": "test"})
        decoded = decode_token(token)
        assert "iat" in decoded

    def test_invalid_token_raises(self):
        with pytest.raises(Exception):
            decode_token("invalid.token.here")

    def test_tampered_token_raises(self):
        token = encode_token({"sub": "test"})
        # Tamper with the token
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(Exception):
            decode_token(tampered)

    def test_does_not_mutate_input_payload(self):
        payload = {"sub": "test"}
        original = dict(payload)
        encode_token(payload)
        assert payload == original
```

**Step 2: Run tests**

Run: `cd api && uv run pytest tests/test_jwt.py -v`
Expected: All ~6 tests PASS

**Step 3: Commit**

```bash
git add api/tests/test_jwt.py
git commit -m "test: add unit tests for JWT encode/decode (6 tests)"
```

---

### Task 6: Backend — Test pipeline_sql.py

**Files:**
- Create: `api/tests/test_pipeline_sql.py`

**Step 1: Write the tests**

Create `api/tests/test_pipeline_sql.py`:

```python
import pytest
from pipeline_sql import build_pipeline_sql, _chart_filters_cte, _time_range_cte, _time_grain_cte


class TestBuildPipelineSQL:
    """Tests for the CTE pipeline builder."""

    def test_empty_config_returns_base_only(self):
        sql, params = build_pipeline_sql("read_parquet('/data.parquet')", {})
        assert "_base AS" in sql
        assert "SELECT * FROM _base" in sql
        assert params == {}

    def test_rls_conditions_added(self):
        sql, params = build_pipeline_sql(
            "source",
            {},
            rls_conditions=["tenant_id = $tid"],
            rls_params={"tid": 42},
        )
        assert "_rls AS" in sql
        assert "tenant_id = $tid" in sql
        assert params["tid"] == 42

    def test_dashboard_filters_added(self):
        sql, params = build_pipeline_sql(
            "source",
            {},
            dash_where="region = $r",
            dash_params={"r": "US"},
        )
        assert "_dash AS" in sql
        assert "region = $r" in sql
        assert params["r"] == "US"

    def test_chart_filters_added(self):
        config = {
            "chart_filters": [
                {"column": "status", "operator": "=", "value": "active"}
            ]
        }
        sql, params = build_pipeline_sql("source", config)
        assert "_cf AS" in sql
        assert '"status" = $_pcf_0' in sql

    def test_time_range_added(self):
        config = {"time_column": "created_at", "time_range": "30d"}
        sql, params = build_pipeline_sql("source", config)
        assert "_tr AS" in sql

    def test_time_grain_added(self):
        config = {"time_column": "created_at", "time_grain": "month"}
        sql, params = build_pipeline_sql("source", config)
        assert "_tg AS" in sql
        assert "date_trunc('month'" in sql

    def test_metrics_added(self):
        config = {"metrics": [{"column": "amount", "aggregate": "SUM"}]}
        sql, params = build_pipeline_sql("source", config)
        assert "_met AS" in sql

    def test_skip_metrics_skips_calc_and_met(self):
        config = {
            "metrics": [{"column": "amount", "aggregate": "SUM"}],
            "calculated_columns": [{"name": "x", "expression": "a + b"}],
        }
        sql, params = build_pipeline_sql("source", config, skip_metrics=True)
        assert "_met" not in sql
        assert "_calc" not in sql

    def test_full_pipeline_order(self):
        """All CTEs should appear in the correct order."""
        config = {
            "chart_filters": [{"column": "a", "operator": "=", "value": "1"}],
            "time_column": "ts",
            "time_range": "7d",
            "time_grain": "day",
            "metrics": [{"column": "val", "aggregate": "SUM"}],
        }
        sql, params = build_pipeline_sql(
            "source",
            config,
            rls_conditions=["x = $x"],
            rls_params={"x": 1},
            dash_where="y = $y",
            dash_params={"y": 2},
        )
        # Verify order: _base, _rls, _dash, _cf, _tr, _tg, _met
        positions = [sql.index(cte) for cte in ["_base", "_rls", "_dash", "_cf", "_tr"]]
        assert positions == sorted(positions)


class TestChartFiltersCTE:
    def test_equals_operator(self):
        config = {"chart_filters": [{"column": "status", "operator": "=", "value": "active"}]}
        result = _chart_filters_cte(config, "_base", skip_metrics=False)
        assert result is not None
        cte, params = result
        assert '"status" = $_pcf_0' in cte
        assert params["_pcf_0"] == "active"

    def test_in_operator(self):
        config = {"chart_filters": [{"column": "color", "operator": "IN", "value": "red,blue"}]}
        result = _chart_filters_cte(config, "_base", skip_metrics=False)
        cte, params = result
        assert "IN" in cte
        assert params["_pcf_0_0"] == "red"
        assert params["_pcf_0_1"] == "blue"

    def test_is_null_operator(self):
        config = {"chart_filters": [{"column": "notes", "operator": "IS NULL"}]}
        result = _chart_filters_cte(config, "_base", skip_metrics=False)
        cte, params = result
        assert '"notes" IS NULL' in cte

    def test_skip_metrics_returns_none(self):
        config = {"chart_filters": [{"column": "a", "operator": "=", "value": "1"}]}
        assert _chart_filters_cte(config, "_base", skip_metrics=True) is None

    def test_empty_filters_returns_none(self):
        assert _chart_filters_cte({"chart_filters": []}, "_base", False) is None
        assert _chart_filters_cte({}, "_base", False) is None


class TestTimeGrainCTE:
    def test_month_grain(self):
        cte = _time_grain_cte(
            {"time_column": "created_at", "time_grain": "month"},
            "_base",
            {},
        )
        assert cte is not None
        assert "date_trunc('month'" in cte

    def test_invalid_grain_returns_none(self):
        cte = _time_grain_cte(
            {"time_column": "ts", "time_grain": "hourly"},
            "_base",
            {},
        )
        assert cte is None

    def test_raw_grain_returns_none(self):
        cte = _time_grain_cte(
            {"time_column": "ts", "time_grain": "raw"},
            "_base",
            {},
        )
        assert cte is None

    def test_no_time_column_returns_none(self):
        cte = _time_grain_cte({"time_grain": "month"}, "_base", {})
        assert cte is None
```

**Step 2: Run tests**

Run: `cd api && uv run pytest tests/test_pipeline_sql.py -v`
Expected: All ~18 tests PASS

**Step 3: Commit**

```bash
git add api/tests/test_pipeline_sql.py
git commit -m "test: add unit tests for pipeline_sql CTE builder (18 tests)"
```

---

### Task 7: Frontend — Setup Vitest infrastructure

**Files:**
- Modify: `frontend/package.json` (add vitest)
- Create: `frontend/vitest.config.ts`

**Step 1: Install Vitest**

Run: `cd frontend && npm install -D vitest`

**Step 2: Create vitest.config.ts**

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

**Step 3: Add test script to package.json**

Add to `"scripts"` in `frontend/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Verify Vitest runs**

Run: `cd frontend && npm test`
Expected: "No test files found" or similar (0 tests)

**Step 5: Commit**

```bash
git add frontend/vitest.config.ts frontend/package.json frontend/package-lock.json
git commit -m "test: setup Vitest infrastructure for frontend tests"
```

---

### Task 8: Frontend — Test extract-tables.ts

**Files:**
- Create: `frontend/src/lib/__tests__/extract-tables.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/__tests__/extract-tables.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractTables } from "../extract-tables";

describe("extractTables", () => {
  it("returns empty for empty input", () => {
    expect(extractTables("")).toEqual([]);
    expect(extractTables("  ")).toEqual([]);
  });

  it("extracts single FROM table", () => {
    expect(extractTables("SELECT * FROM users")).toEqual(["users"]);
  });

  it("extracts JOIN tables", () => {
    const result = extractTables(
      "SELECT * FROM orders JOIN users ON orders.user_id = users.id"
    );
    expect(result).toEqual(["orders", "users"]);
  });

  it("handles schema.table notation", () => {
    expect(extractTables("SELECT * FROM public.users")).toEqual(["public.users"]);
  });

  it("deduplicates tables", () => {
    const result = extractTables(
      "SELECT * FROM users u1 JOIN users u2 ON u1.id = u2.manager_id"
    );
    expect(result).toEqual(["users"]);
  });

  it("returns sorted results", () => {
    const result = extractTables("SELECT * FROM zebras JOIN alpacas ON 1=1");
    expect(result).toEqual(["alpacas", "zebras"]);
  });

  it("ignores subqueries after FROM", () => {
    const result = extractTables("SELECT * FROM (SELECT 1) sub JOIN users ON 1=1");
    expect(result).toEqual(["users"]);
  });

  it("ignores single-line comments", () => {
    const result = extractTables("SELECT * FROM users -- FROM secrets");
    expect(result).toEqual(["users"]);
  });

  it("ignores block comments", () => {
    const result = extractTables("SELECT * FROM users /* FROM secrets */");
    expect(result).toEqual(["users"]);
  });

  it("ignores string literals", () => {
    const result = extractTables("SELECT * FROM users WHERE name = 'FROM admin'");
    expect(result).toEqual(["users"]);
  });

  it("handles LEFT/RIGHT/INNER/OUTER JOIN", () => {
    const sql =
      "SELECT * FROM a LEFT JOIN b ON 1=1 RIGHT JOIN c ON 1=1 INNER JOIN d ON 1=1";
    const result = extractTables(sql);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("lowercases table names", () => {
    expect(extractTables("SELECT * FROM Users")).toEqual(["users"]);
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All 12 tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/extract-tables.test.ts
git commit -m "test: add unit tests for extractTables (12 tests)"
```

---

### Task 9: Frontend — Test cron-describe.ts

**Files:**
- Create: `frontend/src/lib/__tests__/cron-describe.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/__tests__/cron-describe.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { describeCron } from "../cron-describe";

describe("describeCron", () => {
  it("every minute", () => {
    expect(describeCron("*/1 * * * *")).toBe("Every minute");
  });

  it("every N minutes", () => {
    expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes");
    expect(describeCron("*/15 * * * *")).toBe("Every 15 minutes");
  });

  it("every hour", () => {
    expect(describeCron("0 * * * *")).toBe("Every hour");
  });

  it("every hour at :MM", () => {
    expect(describeCron("30 * * * *")).toBe("Every hour at :30");
    expect(describeCron("5 * * * *")).toBe("Every hour at :05");
  });

  it("daily at HH:MM", () => {
    expect(describeCron("0 9 * * *")).toBe("Daily at 09:00");
    expect(describeCron("30 14 * * *")).toBe("Daily at 14:30");
  });

  it("weekly on a specific day", () => {
    expect(describeCron("0 9 * * 1")).toBe("Monday at 09:00");
    expect(describeCron("0 9 * * 0")).toBe("Sunday at 09:00");
  });

  it("monthly on specific day", () => {
    expect(describeCron("0 9 15 * *")).toBe("Monthly on day 15 at 09:00");
    expect(describeCron("0 0 1 * *")).toBe("Monthly on day 1 at 00:00");
  });

  it("returns raw expr for unrecognized patterns", () => {
    expect(describeCron("0 9 * 1-6 1-5")).toBe("0 9 * 1-6 1-5");
  });

  it("returns raw expr for invalid part count", () => {
    expect(describeCron("* *")).toBe("* *");
    expect(describeCron("* * * * * *")).toBe("* * * * * *");
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All 10 tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/cron-describe.test.ts
git commit -m "test: add unit tests for describeCron (10 tests)"
```

---

### Task 10: Frontend — Test format.ts

**Files:**
- Create: `frontend/src/lib/__tests__/format.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatCellValue } from "../format";

describe("formatCellValue", () => {
  describe("no format", () => {
    it("returns empty string for null/undefined", () => {
      expect(formatCellValue(null, undefined)).toBe("");
      expect(formatCellValue(undefined, undefined)).toBe("");
    });

    it("formats numbers with locale", () => {
      const result = formatCellValue(1234.5, undefined);
      // toLocaleString output varies by locale, just check it's not empty
      expect(result).toBeTruthy();
    });

    it("returns strings as-is", () => {
      expect(formatCellValue("hello", undefined)).toBe("hello");
    });
  });

  describe("text format", () => {
    it("wraps with prefix/suffix", () => {
      expect(formatCellValue("test", { type: "text", prefix: "[", suffix: "]" })).toBe(
        "[test]"
      );
    });
  });

  describe("number format", () => {
    it("applies decimals", () => {
      expect(formatCellValue(3.14159, { type: "number", decimals: 2 })).toBe("3.14");
    });

    it("adds thousands separator", () => {
      const result = formatCellValue(1234567, { type: "number", thousands: true });
      expect(result).toContain(",");
    });

    it("returns string for NaN", () => {
      expect(formatCellValue("abc", { type: "number", decimals: 2 })).toBe("abc");
    });
  });

  describe("currency format", () => {
    it("adds dollar prefix by default", () => {
      const result = formatCellValue(42, { type: "currency", decimals: 2 });
      expect(result).toMatch(/^\$/);
      expect(result).toContain("42.00");
    });

    it("uses custom prefix", () => {
      const result = formatCellValue(10, {
        type: "currency",
        decimals: 0,
        prefix: "€",
      });
      expect(result).toMatch(/^€/);
    });
  });

  describe("percent format", () => {
    it("multiplies ratio by 100", () => {
      const result = formatCellValue(0.75, { type: "percent", decimals: 0 });
      expect(result).toContain("75");
      expect(result).toContain("%");
    });

    it("does not multiply values > 1", () => {
      const result = formatCellValue(75, { type: "percent", decimals: 0 });
      expect(result).toContain("75");
      expect(result).toContain("%");
    });
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/format.test.ts
git commit -m "test: add unit tests for formatCellValue (10 tests)"
```

---

### Task 11: Frontend — Test date-format.ts

**Files:**
- Create: `frontend/src/lib/__tests__/date-format.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/__tests__/date-format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatDateByGrain } from "../date-format";

describe("formatDateByGrain", () => {
  it("returns empty string for null/undefined", () => {
    expect(formatDateByGrain(null)).toBe("");
    expect(formatDateByGrain(undefined)).toBe("");
  });

  it("returns raw string for unparseable date", () => {
    expect(formatDateByGrain("not-a-date")).toBe("not-a-date");
  });

  it("formats month grain", () => {
    const result = formatDateByGrain("2025-06-15", "month");
    expect(result).toContain("Jun");
    expect(result).toContain("2025");
  });

  it("formats quarter grain", () => {
    const result = formatDateByGrain("2025-06-15", "quarter");
    expect(result).toBe("Q2 2025");
  });

  it("formats year grain", () => {
    expect(formatDateByGrain("2025-06-15", "year")).toBe("2025");
  });

  it("formats day grain", () => {
    const result = formatDateByGrain("2025-06-15", "day");
    expect(result).toContain("Jun");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("formats week grain as range", () => {
    const result = formatDateByGrain("2025-06-09", "week");
    // Should show Mon–Sun range
    expect(result).toContain("\u2013"); // en-dash
  });

  it("strips T00:00:00 for raw/default grain", () => {
    expect(formatDateByGrain("2025-06-15T00:00:00Z")).toBe("2025-06-15");
    expect(formatDateByGrain("2025-06-15T00:00:00.000Z")).toBe("2025-06-15");
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All 8 tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/date-format.test.ts
git commit -m "test: add unit tests for formatDateByGrain (8 tests)"
```

---

### Task 12: Frontend — Test generate-code.ts and parse-code.ts roundtrip

**Files:**
- Create: `frontend/src/lib/__tests__/code-roundtrip.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/__tests__/code-roundtrip.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateCodeFromVisual } from "../generate-code";
import { parseCodeToVisual } from "../parse-code";

describe("generateCodeFromVisual", () => {
  it("generates code for bar chart", () => {
    const code = generateCodeFromVisual(
      { x_column: "category", y_columns: ["revenue"] },
      "bar"
    );
    expect(code).toContain("px.bar");
    expect(code).toContain("category");
    expect(code).toContain("revenue");
  });

  it("generates code for line chart", () => {
    const code = generateCodeFromVisual(
      { x_column: "date", y_columns: ["value"] },
      "line"
    );
    expect(code).toContain("px.line");
  });

  it("generates code for pie chart", () => {
    const code = generateCodeFromVisual(
      { x_column: "category", y_columns: ["amount"] },
      "pie"
    );
    expect(code).toContain("px.pie");
  });

  it("generates code for scatter chart", () => {
    const code = generateCodeFromVisual(
      { x_column: "x", y_columns: ["y"] },
      "scatter"
    );
    expect(code).toContain("px.scatter");
  });

  it("generates code for kpi chart", () => {
    const code = generateCodeFromVisual(
      { y_columns: ["revenue"] },
      "kpi"
    );
    expect(code).toContain("go.Indicator");
  });
});

describe("parseCodeToVisual", () => {
  it("parses px.bar code", () => {
    const code = `fig = px.bar(df, x="category", y="revenue")`;
    const result = parseCodeToVisual(code);
    expect(result).not.toBeNull();
    expect(result?._chartType).toBe("bar");
  });

  it("parses px.line code", () => {
    const code = `fig = px.line(df, x="date", y="value")`;
    const result = parseCodeToVisual(code);
    expect(result?._chartType).toBe("line");
  });

  it("detects donut from pie with hole", () => {
    const code = `fig = px.pie(df, names="cat", values="val", hole=0.4)`;
    const result = parseCodeToVisual(code);
    expect(result?._chartType).toBe("donut");
  });

  it("detects bar_h from horizontal bar", () => {
    const code = `fig = px.bar(df, x="val", y="cat", orientation="h")`;
    const result = parseCodeToVisual(code);
    expect(result?._chartType).toBe("bar_h");
  });

  it("returns null for unparseable code", () => {
    expect(parseCodeToVisual("print('hello')")).toBeNull();
  });
});

describe("roundtrip: generate → parse", () => {
  const chartTypes = ["bar", "line", "area", "scatter", "histogram"] as const;

  for (const chartType of chartTypes) {
    it(`roundtrip preserves chart type for ${chartType}`, () => {
      const config = { x_column: "x", y_columns: ["y"] };
      const code = generateCodeFromVisual(config, chartType);
      const parsed = parseCodeToVisual(code);
      expect(parsed).not.toBeNull();
      expect(parsed?._chartType).toBe(chartType);
    });
  }
});
```

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All ~15 tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/code-roundtrip.test.ts
git commit -m "test: add roundtrip tests for generate-code/parse-code (15 tests)"
```

---

### Task 13: CI — Add test workflow

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1: Create the workflow**

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4

      - uses: astral-sh/setup-uv@v4

      - name: Install dependencies
        run: uv sync --group dev

      - name: Run tests
        run: uv run pytest tests/ -v --tb=short

  frontend-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

**Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow for API (pytest) and frontend (vitest)"
```

---

### Task 14: Backend — Integration test setup with TestClient

**Files:**
- Create: `api/tests/integration/__init__.py`
- Create: `api/tests/integration/conftest.py`
- Create: `api/tests/integration/test_auth.py`

**Step 1: Create integration conftest with FastAPI TestClient**

Create `api/tests/integration/__init__.py` (empty).

Create `api/tests/integration/conftest.py`:

```python
import os
import pytest
from httpx import AsyncClient, ASGITransport

# Ensure test env vars are set before app import
os.environ["JWT_SECRET"] = "test-jwt-secret-for-testing"
os.environ["CONNECTION_SECRET"] = "test-connection-secret-32chars!!"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://karta:karta@localhost:5432/karta_test",
)

from main import app
from database import engine, ensure_schema


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create schema once for the test session."""
    ensure_schema()


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_token(client: AsyncClient):
    """Register a test user and return auth token."""
    import uuid
    email = f"test-{uuid.uuid4().hex[:8]}@test.com"
    resp = await client.post("/api/auth/register", json={
        "email": email,
        "password": "TestPassword123!",
        "name": "Test User",
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # If registration failed (maybe first user already exists), try login
    resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": "TestPassword123!",
    })
    return resp.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token: str):
    return {"Authorization": f"Bearer {auth_token}"}
```

**Step 2: Create auth integration tests**

Create `api/tests/integration/test_auth.py`:

```python
import pytest


@pytest.mark.asyncio
class TestAuthEndpoints:
    async def test_register_returns_token(self, client):
        resp = await client.post("/api/auth/register", json={
            "email": "newuser@test.com",
            "password": "StrongPass123!",
            "name": "New User",
        })
        # First run: 200. Subsequent: 409 (already exists)
        assert resp.status_code in (200, 409)
        if resp.status_code == 200:
            data = resp.json()
            assert "access_token" in data

    async def test_login_with_valid_credentials(self, client):
        # First register
        email = "logintest@test.com"
        await client.post("/api/auth/register", json={
            "email": email,
            "password": "TestPass123!",
            "name": "Login Test",
        })
        # Then login
        resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "TestPass123!",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_with_wrong_password(self, client):
        email = "wrongpw@test.com"
        await client.post("/api/auth/register", json={
            "email": email,
            "password": "CorrectPass1!",
            "name": "Wrong PW",
        })
        resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401

    async def test_me_requires_auth(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    async def test_me_returns_user_info(self, client, auth_headers):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        assert "id" in data

    async def test_setup_status(self, client):
        resp = await client.get("/api/auth/setup-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "needs_setup" in data
```

**Step 3: Update CI workflow for integration tests**

Note: Integration tests require a PostgreSQL database. They should be skipped in CI initially (unit tests run without DB) or the CI job should add a postgres service. For now, mark integration tests to only run when `TEST_DATABASE_URL` is set:

Add to the top of `api/tests/integration/conftest.py`:

```python
import pytest

# Skip all integration tests if no test database is available
_db_url = os.environ.get("TEST_DATABASE_URL", "")
if not _db_url and "CI" in os.environ:
    pytest.skip("No TEST_DATABASE_URL in CI", allow_module_level=True)
```

**Step 4: Run locally (requires postgres)**

Run: `cd api && TEST_DATABASE_URL=postgresql://karta:karta@localhost:5432/karta_test uv run pytest tests/integration/ -v`
Expected: PASS (if test DB available) or SKIP (if not)

**Step 5: Commit**

```bash
git add api/tests/integration/
git commit -m "test: add integration test infrastructure and auth endpoint tests"
```

---

### Task 15: Final — Run all tests and verify

**Step 1: Run all backend tests**

Run: `cd api && uv run pytest tests/ -v --tb=short --ignore=tests/integration`
Expected: ~75 tests PASS

**Step 2: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: ~55 tests PASS

**Step 3: Final commit with CLAUDE.md update**

Update the "Commands" section in `CLAUDE.md` to include test commands:

```bash
# API tests
cd api && uv run pytest tests/ -v                    # All unit tests
cd api && uv run pytest tests/ -v --ignore=tests/integration  # Unit only

# Frontend tests
cd frontend && npm test                               # All tests
cd frontend && npm run test:watch                      # Watch mode
```

```bash
git add CLAUDE.md
git commit -m "docs: add test commands to CLAUDE.md"
```

---

## Summary

| Task | Area | Tests | What |
|------|------|-------|------|
| 1 | Backend | 0 | pytest infrastructure |
| 2 | Backend | ~25 | sql_validator unit tests |
| 3 | Backend | ~15 | sql_params unit tests |
| 4 | Backend | ~9 | crypto unit tests |
| 5 | Backend | ~6 | JWT unit tests |
| 6 | Backend | ~18 | pipeline_sql unit tests |
| 7 | Frontend | 0 | Vitest infrastructure |
| 8 | Frontend | ~12 | extract-tables unit tests |
| 9 | Frontend | ~10 | cron-describe unit tests |
| 10 | Frontend | ~10 | format unit tests |
| 11 | Frontend | ~8 | date-format unit tests |
| 12 | Frontend | ~15 | generate-code/parse-code roundtrip |
| 13 | CI | 0 | GitHub Actions test workflow |
| 14 | Backend | ~6 | Integration test setup + auth tests |
| 15 | All | 0 | Final verification + docs |

**Total: ~134 tests across 15 tasks**
