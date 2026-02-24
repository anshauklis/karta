"""AES-256-GCM encryption for connection passwords."""

import os
import base64
import hashlib
import logging

from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

_logger = logging.getLogger(__name__)

CONNECTION_SECRET = os.environ.get("CONNECTION_SECRET", "")


def _get_key() -> bytes:
    """Derive 32-byte AES key from CONNECTION_SECRET via HKDF."""
    if not CONNECTION_SECRET:
        raise RuntimeError("CONNECTION_SECRET environment variable not set")
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"karta-connection-key")
    return hkdf.derive(CONNECTION_SECRET.encode())


def _get_legacy_key() -> bytes:
    """Legacy SHA-256 key derivation for backward compatibility."""
    return hashlib.sha256(CONNECTION_SECRET.encode()).digest()


def encrypt_password(plaintext: str) -> str:
    """Encrypt password with AES-256-GCM. Returns base64(nonce + ciphertext)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _get_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt_password(ciphertext_b64: str) -> str:
    """Decrypt AES-256-GCM encrypted password."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _get_key()
    raw = base64.b64decode(ciphertext_b64)
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode()


def decrypt_password_safe(ciphertext_b64: str) -> str:
    """Try HKDF key, then legacy SHA-256 key, then base64 for migration."""
    if not CONNECTION_SECRET:
        raise ValueError("CONNECTION_SECRET is required for password decryption")
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    raw = base64.b64decode(ciphertext_b64)
    nonce, ct = raw[:12], raw[12:]

    # Try HKDF-derived key first (current)
    try:
        return AESGCM(_get_key()).decrypt(nonce, ct, None).decode()
    except Exception:
        pass

    # Try legacy SHA-256 key (migration from old installs)
    try:
        result = AESGCM(_get_legacy_key()).decrypt(nonce, ct, None).decode()
        _logger.warning(
            "DEPRECATION: Decrypted with legacy SHA-256 key. "
            "Re-save this connection to upgrade to HKDF encryption."
        )
        return result
    except Exception:
        pass

    # Last resort: plain base64 (very old data)
    _logger.warning(
        "DEPRECATION: AES decryption failed — falling back to legacy base64. "
        "Re-save this connection to upgrade encryption."
    )
    return base64.b64decode(ciphertext_b64).decode()


def encrypt_password_safe(plaintext: str) -> str:
    """Encrypt password with AES. Requires CONNECTION_SECRET."""
    if not CONNECTION_SECRET:
        raise ValueError("CONNECTION_SECRET is required for password encryption")
    return encrypt_password(plaintext)
