# Single Sign-On (SSO)

Karta supports three SSO protocols: **OIDC**, **SAML**, and **LDAP**. Provider configurations are stored in the database and managed through the admin UI. Requires an enterprise license with the `sso` feature enabled.

:::{note}
Without an enterprise license, SSO configuration is disabled. Users authenticate with the built-in email/password method only.
:::

## Accessing SSO Settings

Navigate to **Admin > SSO** in the sidebar (admin role required).

## Adding a Provider

1. Click {guilabel}`Add Provider`
2. Select the provider type from the dropdown
3. Fill in the configuration fields (see table below)
4. Click {guilabel}`Save`

## Provider Types

| Type | Configuration Fields |
|------|---------------------|
| **OIDC** | Issuer URL, Client ID, Client Secret |
| **SAML** | Metadata URL, Entity ID |
| **LDAP** | Host, Port, Base DN, Bind DN, Bind Password, User Search Filter, Email Attribute, TLS toggle |

### OIDC

OpenID Connect is the recommended SSO method. Compatible with Okta, Azure AD, Google Workspace, Auth0, Keycloak, and any standard OIDC provider.

| Field | Description | Example |
|-------|-------------|---------|
| **Issuer URL** | The OIDC issuer endpoint | `https://accounts.google.com` |
| **Client ID** | OAuth 2.0 client identifier | `abc123.apps.googleusercontent.com` |
| **Client Secret** | OAuth 2.0 client secret | `GOCSPX-...` |

Karta uses the OIDC discovery endpoint (`/.well-known/openid-configuration`) to automatically resolve authorization, token, and userinfo endpoints.

### SAML

SAML 2.0 support is provided through the BoxyHQ Jackson service, which acts as a SAML-to-OIDC bridge.

| Field | Description | Example |
|-------|-------------|---------|
| **Metadata URL** | URL to the IdP's SAML metadata XML | `https://idp.example.com/metadata.xml` |
| **Entity ID** | The SP entity identifier | `https://karta.example.com` |

:::{warning}
SAML requires the BoxyHQ Jackson sidecar service. See [SAML with BoxyHQ](#saml-with-boxyhq) below for setup instructions.
:::

### LDAP

LDAP authentication is handled entirely on the backend — credentials are verified against the LDAP directory server, and a local Karta user account is created or updated on first login.

| Field | Description | Example |
|-------|-------------|---------|
| **Host** | LDAP server hostname | `ldap.example.com` |
| **Port** | LDAP server port | `389` (plaintext) or `636` (TLS) |
| **Base DN** | Search base for user lookups | `ou=People,dc=example,dc=com` |
| **Bind DN** | DN used to bind for searches | `cn=admin,dc=example,dc=com` |
| **Bind Password** | Password for the bind DN | (stored encrypted) |
| **User Search Filter** | LDAP filter to locate the user | `(uid={username})` |
| **Email Attribute** | Attribute containing the user's email | `mail` |
| **TLS** | Toggle to enable LDAPS or StartTLS | On/Off |

## Testing a Provider

Click the plug icon next to a provider row to test the connection:

- A **green check** indicates the provider responded successfully
- A **red X** indicates a connection failure — hover to see the error details

:::{tip}
For OIDC, testing verifies that the discovery endpoint is reachable and returns valid metadata. For LDAP, testing performs a bind operation with the configured credentials.
:::

## Enabling and Disabling

Toggle the switch next to a provider's status badge to enable or disable it. Disabling a provider prevents users from authenticating through it without deleting the configuration.

- **Enabled** — provider appears on the login page and accepts authentication requests
- **Disabled** — provider is hidden from the login page; existing sessions are not affected

## SAML with BoxyHQ

For SAML support, start the enterprise profile that includes the BoxyHQ Jackson service:

```bash
docker compose --profile enterprise up -d
```

This starts the Jackson service on port **5225**. Karta communicates with Jackson internally via the Docker network.

Jackson acts as a SAML-to-OIDC bridge: the Identity Provider sends SAML assertions to Jackson, which translates them into OIDC tokens that Karta consumes. This means Karta's SAML support requires no additional SAML libraries — Jackson handles the protocol complexity.

:::{note}
The Jackson service must be running before SAML providers can be tested or used for authentication.
:::

## LDAP Authentication Flow

The LDAP login endpoint (`POST /api/auth/ldap`) follows this sequence:

1. User submits `username` and `password` to the login form
2. Karta binds to the LDAP server using the configured Bind DN and Bind Password
3. Karta searches for the user using the configured Base DN and User Search Filter
4. If the user is found, Karta attempts to bind with the user's DN and submitted password
5. On successful bind, Karta creates or updates the local user account (email from the configured Email Attribute)
6. A JWT session token is issued and returned to the client

:::{warning}
LDAP passwords are transmitted from the client to Karta and then to the LDAP server. Always use HTTPS between the browser and Karta, and enable TLS for the LDAP connection.
:::

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/sso/providers` | List all configured providers | Admin |
| `POST` | `/api/sso/providers` | Create a new provider | Admin |
| `PUT` | `/api/sso/providers/{id}` | Update provider configuration | Admin |
| `DELETE` | `/api/sso/providers/{id}` | Delete a provider | Admin |
| `POST` | `/api/sso/providers/{id}/test` | Test provider connection | Admin |
| `POST` | `/api/auth/ldap` | LDAP login | Public |

All SSO management endpoints require `Bearer <JWT>` authentication with admin role. The LDAP login endpoint is public (no authentication required, as it is the authentication mechanism itself).

## Important Notes

- Provider secrets (Client Secret, Bind Password) are encrypted at rest using AES-256-GCM, the same mechanism used for database connection passwords
- Multiple providers of the same type can be configured (e.g., separate OIDC providers for different departments)
- When a user authenticates via SSO for the first time, a local account is automatically created with the `viewer` role
- SSO users can be promoted to higher roles through the standard user management interface
- Deleting a provider does not delete user accounts that were created through it
