"""Unit tests for auth.jwt module — encode_token and decode_token."""

import time

import jwt as pyjwt
import pytest

from auth.jwt import JWT_SECRET, encode_token, decode_token


class TestEncodeDecodeRoundtrip:
    def test_payload_preserved(self):
        payload = {"sub": "user@example.com", "role": "admin"}
        token = encode_token(payload)
        decoded = decode_token(token)
        assert decoded["sub"] == "user@example.com"
        assert decoded["role"] == "admin"


class TestTokenClaims:
    def test_exp_claim_in_future(self):
        token = encode_token({"sub": "u1"})
        decoded = decode_token(token)
        assert "exp" in decoded
        assert decoded["exp"] > time.time()

    def test_iat_claim_present(self):
        token = encode_token({"sub": "u1"})
        decoded = decode_token(token)
        assert "iat" in decoded
        # iat should be approximately now (within 5 seconds)
        assert abs(decoded["iat"] - time.time()) < 5


class TestInvalidTokens:
    def test_invalid_token_raises(self):
        with pytest.raises(pyjwt.exceptions.DecodeError):
            decode_token("not-a-valid-token")

    def test_tampered_token_raises(self):
        token = encode_token({"sub": "u1"})
        # Flip a character in the signature (last segment)
        parts = token.split(".")
        sig = parts[2]
        tampered_char = "A" if sig[0] != "A" else "B"
        parts[2] = tampered_char + sig[1:]
        tampered_token = ".".join(parts)
        with pytest.raises(pyjwt.exceptions.InvalidSignatureError):
            decode_token(tampered_token)


class TestNoMutation:
    def test_does_not_mutate_input_payload(self):
        payload = {"sub": "u1", "role": "viewer"}
        original = payload.copy()
        encode_token(payload)
        assert payload == original
