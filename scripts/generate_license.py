#!/usr/bin/env python3
"""Generate a KARTA_LICENSE JWT for development/testing."""

import time
import jwt

PRIVATE_KEY_PATH = "scripts/license_private.pem"


def generate(tier="enterprise", features=None, org="dev", max_users=100, days=365):
    if features is None:
        features = ["sso", "audit", "rbac", "whitelabel", "multitenant"]
    with open(PRIVATE_KEY_PATH) as f:
        private_key = f.read()
    claims = {
        "org": org,
        "tier": tier,
        "features": features,
        "max_users": max_users,
        "exp": int(time.time()) + days * 86400,
        "iat": int(time.time()),
    }
    token = jwt.encode(claims, private_key, algorithm="RS256")
    print(f"KARTA_LICENSE={token}")


if __name__ == "__main__":
    generate()
