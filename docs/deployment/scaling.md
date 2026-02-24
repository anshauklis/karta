# Scaling

Karta is designed for small-to-medium teams (1-100 users). For larger deployments, consider the following.

## Vertical Scaling

Increase resource limits in `docker-compose.yml`:

```yaml
api:
  mem_limit: 2g
  deploy:
    resources:
      limits:
        cpus: "2.0"

postgres:
  mem_limit: 4g
```

## Horizontal Scaling (API)

The FastAPI backend runs with 2 workers by default. To increase:

Edit `api/Dockerfile`, change the CMD:

```dockerfile
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Alternatively, run multiple API containers behind nginx with round-robin load balancing.

## Database Performance

1. **Enable Redis** — caches query results for 5 minutes
2. **PostgreSQL tuning** — adjust `shared_buffers`, `work_mem`, `effective_cache_size` in a custom `postgresql.conf`
3. **Connection pooling** — SQLAlchemy connection pool is configured by default
