# Troubleshooting

## Charts

### "No Data" Message

- Verify your SQL query returns results in SQL Lab first
- Check that the correct connection is selected
- Ensure the X and Y axis columns are mapped to actual column names from the query

### Chart Shows an Error

The error message is displayed below the chart. Common causes:

| Error | Cause | Fix |
|-------|-------|-----|
| SQL syntax error | Invalid query | Test the query in SQL Lab |
| Connection timeout | Database unreachable | Check database connectivity |
| Column not found | Wrong column name | Column names are case-sensitive |
| Permission denied | Database user lacks access | Grant SELECT on the target tables |

### Auto-Save Draft Recovery

If the chart editor closes unexpectedly:

1. Reopen the chart editor
2. An amber banner appears: "Unsaved draft found"
3. Click **Restore** to recover unsaved changes
4. Click **Dismiss** to discard and load the last saved version

Drafts are saved every 30 seconds and expire after 1 hour.

## Dashboards

### Shared Link Shows "Link Expired"

Share links can have an expiration. Ask the dashboard owner to create a new link (optionally without expiration).

### Dark Mode Charts Look Wrong

Plotly charts adapt to the current theme. If colors appear incorrect:

- Refresh the page — charts re-render with correct theme colors
- Chart backgrounds are transparent and inherit from the page theme

## Connections

### Database Connection Fails

1. Verify the database is running and accessible
2. In Docker: use `host.docker.internal` (macOS/Windows) or the host IP (Linux) — not `localhost`
3. Check that the port is not blocked by a firewall
4. Test from the API container:

   ```bash
   docker compose exec api python -c "
   import psycopg2
   psycopg2.connect('host=... port=... dbname=... user=... password=...')
   print('OK')
   "
   ```

## Services

### Services Won't Start

```bash
# Check status
docker compose ps

# Check logs
docker compose logs <service-name>
```

| Symptom | Cause | Fix |
|---------|-------|-----|
| postgres `unhealthy` | Port 5432 in use | Stop local PostgreSQL or change port |
| api `unhealthy` | Database not ready | Wait 30 seconds, services have health check dependencies |
| frontend build fails | Not enough memory | Increase `mem_limit` to `1g` |
| nginx `502 Bad Gateway` | Backend not ready | Wait for api and frontend health checks |

### SSL Certificate Issues

```bash
# Check certificate status
docker compose exec certbot certbot certificates

# Force renewal
docker compose exec certbot certbot renew --force-renewal
docker compose exec nginx nginx -s reload

# Verify nginx config
docker compose exec nginx nginx -t
```

### Reset Admin Password

```bash
# Generate bcrypt hash
docker compose exec api python -c "
import bcrypt
pwd = bcrypt.hashpw(b'new-password', bcrypt.gensalt()).decode()
print(pwd)
"

# Update
docker compose exec postgres psql -U karta karta -c \
  "UPDATE users SET password_hash = '<hash>' WHERE email = 'admin@example.com';"
```

### Fresh Install (Reset Everything)

:::{danger}
This destroys all data including dashboards, charts, users, and connections.
:::

```bash
docker compose down -v
rm .env
./install.sh
```

## Performance

- **Enable Redis** — caches query results for 5 minutes
- **Use LIMIT** — avoid fetching millions of rows
- **Optimize SQL** — add indexes on columns used in WHERE and GROUP BY
- **Dashboard load** — charts execute in parallel; slow queries delay individual charts but don't block others
