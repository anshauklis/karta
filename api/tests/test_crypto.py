"""Tests for AES-256-GCM encryption in crypto.py."""

import base64

import pytest

from crypto import (
    decrypt_password,
    decrypt_password_safe,
    encrypt_password,
    encrypt_password_safe,
)


class TestEncryptDecryptRoundtrip:
    """Basic encrypt/decrypt roundtrip tests."""

    def test_roundtrip_simple(self):
        """Encrypt then decrypt returns the original password."""
        password = "my-secret-password-123"
        encrypted = encrypt_password(password)
        assert decrypt_password(encrypted) == password

    def test_roundtrip_unicode(self):
        """Unicode passwords survive encrypt/decrypt roundtrip."""
        password = "пароль-密码-パスワード-🔑"
        encrypted = encrypt_password(password)
        assert decrypt_password(encrypted) == password

    def test_roundtrip_empty(self):
        """Empty string survives encrypt/decrypt roundtrip."""
        encrypted = encrypt_password("")
        assert decrypt_password(encrypted) == ""

    def test_roundtrip_long_password(self):
        """Long password (10000 chars) survives encrypt/decrypt roundtrip."""
        password = "A" * 10_000
        encrypted = encrypt_password(password)
        assert decrypt_password(encrypted) == password


class TestEncryptedOutput:
    """Tests for the structure of encrypted output."""

    def test_output_is_valid_base64(self):
        """Encrypted output is valid base64 containing nonce (12 bytes) + ciphertext."""
        encrypted = encrypt_password("test")
        raw = base64.b64decode(encrypted)
        # Must be at least 12 bytes (nonce) + 1 byte ciphertext
        # AES-GCM adds a 16-byte auth tag, so minimum is 12 + 16 + len(plaintext)
        assert len(raw) >= 12 + 16 + len("test".encode())
        # Nonce is the first 12 bytes
        nonce = raw[:12]
        assert len(nonce) == 12

    def test_different_encryptions_produce_different_ciphertext(self):
        """Two encryptions of the same password produce different ciphertext (random nonce)."""
        password = "same-password"
        enc1 = encrypt_password(password)
        enc2 = encrypt_password(password)
        assert enc1 != enc2
        # But both decrypt to the same value
        assert decrypt_password(enc1) == password
        assert decrypt_password(enc2) == password


class TestDecryptPasswordSafe:
    """Tests for decrypt_password_safe fallback chain."""

    def test_handles_current_format(self):
        """decrypt_password_safe handles current HKDF-encrypted format."""
        password = "current-format-test"
        encrypted = encrypt_password(password)
        assert decrypt_password_safe(encrypted) == password

    def test_handles_plain_base64_legacy(self):
        """decrypt_password_safe falls back to plain base64 for very old data."""
        password = "legacy-plain-password"
        legacy_encoded = base64.b64encode(password.encode()).decode()
        assert decrypt_password_safe(legacy_encoded) == password


class TestEncryptPasswordSafe:
    """Tests for encrypt_password_safe wrapper."""

    def test_encrypt_password_safe_roundtrip(self):
        """encrypt_password_safe produces output that decrypt_password can read."""
        password = "safe-wrapper-test"
        encrypted = encrypt_password_safe(password)
        assert decrypt_password(encrypted) == password
