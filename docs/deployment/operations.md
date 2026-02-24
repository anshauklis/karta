# Operations

## Starting & Stopping

```bash
# Start all services
docker compose up -d

# Stop all services (preserves data)
docker compose down

# Stop and remove volumes (DESTROYS ALL DATA)
docker compose down -v

# Restart a single service
docker compose restart api

# Rebuild after code changes
docker compose up -d --build
```

## Updating

```bash
cd karta
git pull
docker compose up -d --build
```

The API automatically applies database schema changes on startup. No manual migration step is required.

:::{tip}
Always create a backup before updating production.
:::

## Backups

### Manual Backup

```bash
docker compose exec postgres pg_dump -U karta karta > backup_$(date +%Y%m%d).sql
```

### Automated Daily Backup

Add to crontab (`crontab -e`):

```bash
0 3 * * * cd /opt/karta && docker compose exec -T postgres pg_dump -U karta karta | gzip > /backups/karta_$(date +\%Y\%m\%d).sql.gz && find /backups -name "karta_*.sql.gz" -mtime +30 -delete
```

This runs daily at 3 AM and retains backups for 30 days.

### Restore

```bash
# Stop API to prevent writes
docker compose stop api frontend

# Restore
docker compose exec -T postgres psql -U karta karta < backup.sql

# Restart
docker compose up -d
```

### What's Backed Up

The PostgreSQL dump includes all metadata:
- Users, roles, and permissions
- Database connections (passwords are encrypted)
- Dashboards, charts, layouts
- Datasets, alerts, reports
- Annotations, comments, bookmarks
- RLS rules, change history

Not backed up (doesn't need to be):
- Redis cache (transient, auto-repopulated)
- User's business data (in their own databases)

## Monitoring

### Health Checks

```bash
# All services status
docker compose ps

# API health
curl http://localhost/api/health
# → {"status": "ok"}
```

### Resource Usage

```bash
# Live monitoring
docker stats

# Snapshot
docker stats --no-stream
```

## Logs

```bash
# All logs
docker compose logs

# Follow in real-time
docker compose logs -f

# Specific service
docker compose logs api
docker compose logs frontend
docker compose logs nginx

# Last 100 lines
docker compose logs --tail 100 api
```

### What to Look For

| Service | Log Type | Common Issues |
|---------|----------|---------------|
| **api** | Application | SQL errors, auth failures, chart execution errors |
| **frontend** | Build/Runtime | Next.js build errors, SSR issues |
| **postgres** | Database | Connection limits, slow queries, disk space |
| **nginx** | Access/Error | 502/504 errors, SSL issues |
| **redis** | Cache | Memory warnings |
