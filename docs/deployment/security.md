# Security Hardening

## Production Checklist

- [ ] Run `install.sh` to auto-generate secrets (never use default values)
- [ ] Enable HTTPS (`./install.sh --ssl`)
- [ ] Set `NEXTAUTH_URL` to your actual domain
- [ ] Restrict server access with a firewall (only ports 80, 443, SSH)
- [ ] Set up automated backups
- [ ] Review RLS rules for data isolation

## What's Secured by Default

| Feature | Implementation |
|---------|---------------|
| **Password hashing** | bcrypt with salt |
| **JWT tokens** | HMAC-SHA256, configurable expiration |
| **DB credentials** | AES-256-GCM encryption at rest |
| **SQL injection** | Parameterized queries via SQLAlchemy `text()` |
| **SQL validation** | Destructive statement blocking (DROP, DELETE, ALTER, etc.) |
| **Python sandbox** | Restricted execution for code charts |
| **XSS protection** | DOMPurify for user-generated HTML |
| **CORS** | Configurable origin allowlist |

## Network Security

Only nginx is exposed to the host network. All other services are internal to Docker.

### Firewall Setup (ufw)

```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Reset Admin Password

```bash
# Generate bcrypt hash
docker compose exec api python -c "
import bcrypt
pwd = bcrypt.hashpw(b'new-password', bcrypt.gensalt()).decode()
print(pwd)
"

# Update in database
docker compose exec postgres psql -U karta karta -c \
  "UPDATE users SET password_hash = '<hash>' WHERE email = 'admin@example.com';"
```
