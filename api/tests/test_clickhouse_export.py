"""Native ClickHouse Parquet export: request building + base-spec fallback."""
from sqlalchemy.engine import make_url

from api.engine_specs.base import BaseEngineSpec
from api.engine_specs.clickhouse import clickhouse_http_request


def test_base_spec_has_no_native_export():
    assert BaseEngineSpec().export_parquet(None, "SELECT 1", "/tmp/x.parquet") is False


def test_request_http_creds_in_headers_and_format_suffix():
    url = make_url("clickhouse+http://analytics:s3cret@ch-host:8123/marts")
    endpoint, headers, body = clickhouse_http_request(url, "SELECT a FROM t ;  ")
    assert endpoint == "http://ch-host:8123/"
    assert headers["X-ClickHouse-User"] == "analytics"
    assert headers["X-ClickHouse-Key"] == "s3cret"
    assert headers["X-ClickHouse-Database"] == "marts"
    # trailing semicolon/whitespace stripped, FORMAT Parquet appended
    assert body == b"SELECT a FROM t\nFORMAT Parquet"


def test_request_https_when_protocol_set():
    url = make_url("clickhouse+http://u:p@secure-ch:8443/default?protocol=https")
    endpoint, _headers, _body = clickhouse_http_request(url, "SELECT 1")
    assert endpoint == "https://secure-ch:8443/"


def test_request_defaults_when_missing_parts():
    url = make_url("clickhouse+http://ch-host/")
    endpoint, headers, _body = clickhouse_http_request(url, "SELECT 1")
    assert endpoint == "http://ch-host:8123/"      # default port
    assert headers["X-ClickHouse-User"] == "default"
    assert headers["X-ClickHouse-Database"] == "default"
