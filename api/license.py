"""License system: JWT-based feature gates.

KARTA_LICENSE env var contains RS256-signed JWT with claims:
  org, features[], tier, max_users, exp
"""

import os
import time
import logging
from functools import lru_cache

import jwt
from fastapi import HTTPException

from license_keys import PUBLIC_KEY

logger = logging.getLogger("karta.license")

_GRACE_PERIOD = 7 * 86400  # 7 days after expiry


@lru_cache(maxsize=1)
def _parse_license() -> dict | None:
    token = os.environ.get("KARTA_LICENSE", "").strip()
    if not token:
        return None
    try:
        claims = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])
        return claims
    except jwt.ExpiredSignatureError:
        try:
            claims = jwt.decode(
                token, PUBLIC_KEY, algorithms=["RS256"],
                options={"verify_exp": False},
            )
            exp = claims.get("exp", 0)
            if time.time() - exp < _GRACE_PERIOD:
                logger.warning("License expired but within grace period")
                claims["_grace"] = True
                return claims
        except Exception:
            pass
        logger.error("License expired beyond grace period")
        return None
    except Exception as e:
        logger.error("Invalid license: %s", e)
        return None


def get_license() -> dict | None:
    return _parse_license()


def get_tier() -> str:
    lic = get_license()
    if not lic:
        return "community"
    return lic.get("tier", "community")


def get_features() -> list[str]:
    lic = get_license()
    if not lic:
        return []
    return lic.get("features", [])


def has_feature(name: str) -> bool:
    return name in get_features()


def get_max_users() -> int:
    lic = get_license()
    if not lic:
        return 0
    return lic.get("max_users", 0)


def require_feature(name: str):
    """FastAPI dependency: raises 403 if feature not licensed."""
    def _check():
        if not has_feature(name):
            raise HTTPException(
                status_code=403,
                detail=f"Feature '{name}' requires an enterprise license",
            )
    return _check
