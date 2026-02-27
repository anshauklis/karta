# Karta Quickstart Guide

Get Karta running in 5 minutes.

## Prerequisites

- **Docker** 20+ and **Docker Compose** v2
- **3GB+ RAM** available for containers
- Ports 80 (or custom) available

## Step 1: Clone and Configure

```bash
git clone https://github.com/anshauklis/karta.git
cd karta
cp .env.example .env
```

Edit `.env` and set secure values for:
- `POSTGRES_PASSWORD` — internal database password
- `JWT_SECRET` — 64+ character random string for JWT signing
- `CONNECTION_SECRET` — 32+ character random string for encrypting DB credentials

Or use the install script which generates these automatically:

```bash
./install.sh
```

## Step 2: Start Services

```bash
docker compose up -d
```

This starts 5 services: PostgreSQL, FastAPI backend, Next.js frontend, nginx, and Redis.

Wait ~30 seconds for all services to initialize, then open http://localhost (or your configured PORT).

## Step 3: Create Admin Account

On first visit, you'll see the setup wizard:
1. Set your admin email and password
2. Choose your preferred language (English or Russian)
3. Done — you're in!

## Step 4: Connect a Database

1. Go to **Connections** in the sidebar
2. Click **New Connection**
3. Enter your database details (PostgreSQL, MySQL, MSSQL, ClickHouse, or DuckDB)
4. Click **Test Connection** to verify, then **Save**

A built-in DuckDB connection is created automatically for file uploads and CSV data.

## Step 5: Create Your First Chart

1. Go to **Charts** > **New Chart**
2. Select your connection and write a SQL query (or use AI: click the sparkle icon and describe what you want)
3. Click **Run** to preview results
4. Choose a chart type from the sidebar
5. Configure axes, colors, and labels
6. Click **Save**

## Step 6: Build a Dashboard

1. Go to **Dashboards** > **New Dashboard**
2. Click **Add Chart** to add your charts to the grid
3. Drag and resize charts as needed
4. Click **Save**

## Optional: Enable AI Features

Karta supports AI-powered features with your own API key:

1. Edit `.env`:
   ```
   AI_ENABLED=true
   AI_API_URL=https://api.openai.com/v1
   AI_API_KEY=sk-your-key-here
   AI_MODEL=gpt-4o
   ```
2. Restart: `docker compose up -d --build`

AI features include: text-to-SQL, AI chart builder, natural language dashboard filters, and auto-insights.

## Using Pre-built Images

Skip building from source — use published Docker images:

```bash
curl -O https://raw.githubusercontent.com/anshauklis/karta/main/docker-compose.ghcr.yml
curl -O https://raw.githubusercontent.com/anshauklis/karta/main/.env.example
cp .env.example .env
# Edit .env with your settings
docker compose -f docker-compose.ghcr.yml up -d
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 80 in use | Change `PORT=8080` in `.env` and `NEXTAUTH_URL=http://localhost:8080` |
| Services won't start | Check logs: `docker compose logs -f api` |
| Out of memory | Increase Docker memory limit to 4GB+ |
| Can't connect to database | Verify host is reachable from Docker network (use host.docker.internal for local DBs) |

## Next Steps

- Read the full [README](../README.md) for all features
- Check [CONTRIBUTING.md](../CONTRIBUTING.md) to contribute
- Join the community on GitHub Discussions
