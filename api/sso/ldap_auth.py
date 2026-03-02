"""LDAP authentication backend."""

import logging
from ldap3 import Server, Connection, ALL, SUBTREE

logger = logging.getLogger("karta.sso.ldap")


def authenticate_ldap(username: str, password: str, config: dict) -> dict | None:
    """Authenticate user against LDAP. Returns user info dict or None."""
    host = config.get("host", "localhost")
    port = config.get("port", 389)
    use_tls = config.get("use_tls", False)
    bind_dn = config.get("bind_dn", "")
    bind_password = config.get("bind_password", "")
    search_base = config.get("search_base", "")
    user_filter = config.get("user_filter", "(uid={username})")
    email_attr = config.get("email_attr", "mail")
    name_attr = config.get("name_attr", "cn")

    try:
        server = Server(host, port=port, use_ssl=use_tls, get_info=ALL)
        # Bind with service account
        conn = Connection(server, user=bind_dn, password=bind_password, auto_bind=True)

        # Search for user
        search_filter = user_filter.replace("{username}", username)
        conn.search(search_base, search_filter, search_scope=SUBTREE,
                    attributes=[email_attr, name_attr])

        if not conn.entries:
            logger.warning("LDAP user not found: %s", username)
            return None

        user_dn = conn.entries[0].entry_dn
        user_email = str(getattr(conn.entries[0], email_attr, ""))
        user_name = str(getattr(conn.entries[0], name_attr, username))

        conn.unbind()

        # Verify user password
        user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        user_conn.unbind()

        return {"email": user_email, "name": user_name, "dn": user_dn}
    except Exception as e:
        logger.error("LDAP auth failed: %s", e)
        return None
