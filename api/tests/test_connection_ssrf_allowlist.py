"""SSRF guard: private/internal hosts are blocked by default, but operators can
opt specific hosts in via CONNECTION_ALLOWED_HOSTS (for self-hosted internal DBs).
"""
import pytest
from fastapi import HTTPException

from api.connections.router import _validate_connection_host


def test_private_ip_blocked_by_default(monkeypatch):
    monkeypatch.delenv("CONNECTION_ALLOWED_HOSTS", raising=False)
    with pytest.raises(HTTPException):
        _validate_connection_host("10.1.2.3")


def test_blocked_internal_name_by_default(monkeypatch):
    monkeypatch.delenv("CONNECTION_ALLOWED_HOSTS", raising=False)
    with pytest.raises(HTTPException):
        _validate_connection_host("localhost")


def test_allowlisted_private_ip_passes(monkeypatch):
    monkeypatch.setenv("CONNECTION_ALLOWED_HOSTS", "10.1.2.3, some-other-host")
    _validate_connection_host("10.1.2.3")  # must not raise


def test_allowlist_overrides_blocked_name_case_insensitive(monkeypatch):
    monkeypatch.setenv("CONNECTION_ALLOWED_HOSTS", "localhost")
    _validate_connection_host("LOCALHOST")  # must not raise


def test_public_host_still_allowed(monkeypatch):
    monkeypatch.delenv("CONNECTION_ALLOWED_HOSTS", raising=False)
    # A public IP literal is fine with or without an allowlist.
    _validate_connection_host("8.8.8.8")
