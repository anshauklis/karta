# Connecting to Databases

Karta connects to your existing databases to query data. The internal PostgreSQL instance stores only metadata (dashboards, charts, users) — your data stays in your databases.

## Adding a Connection

1. Navigate to **Connections** in the sidebar
2. Click **New Connection**
3. Fill in the connection details:

| Field | Description |
|-------|-------------|
| **Name** | A friendly name for this connection (e.g., "Production Analytics") |
| **Database Type** | PostgreSQL, MySQL, SQL Server, ClickHouse, or DuckDB |
| **Host** | Database server hostname or IP |
| **Port** | Database port (defaults: PostgreSQL 5432, MySQL 3306, SQL Server 1433, ClickHouse 9000) |
| **Database** | Database name to connect to |
| **Username** | Database user |
| **Password** | Database password (encrypted at rest with AES-256-GCM) |

4. Click **Test Connection** to verify connectivity
5. Click **Save**

## Supported Databases

| Database | Driver | Notes |
|----------|--------|-------|
| **PostgreSQL** | psycopg2 | Full support including schemas, views, and functions |
| **MySQL / MariaDB** | pymysql | Standard MySQL connectivity |
| **Microsoft SQL Server** | pymssql | Via pymssql driver |
| **ClickHouse** | clickhouse-sqlalchemy | Column-oriented analytics database |
| **DuckDB** | duckdb-engine | In-process analytical database |

## Security

- All passwords are encrypted using AES-256-GCM before storage
- Connection credentials are never exposed in API responses
- SQL queries are validated to prevent destructive operations (DROP, DELETE, TRUNCATE, ALTER, etc.)

## Docker Networking

When running Karta in Docker and connecting to a database on the same machine:

- Use `host.docker.internal` (macOS/Windows) or the host's IP address (Linux) instead of `localhost`
- For databases running in the same Docker Compose stack, use the service name as hostname
