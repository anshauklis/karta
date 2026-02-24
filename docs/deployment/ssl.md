# SSL / HTTPS

## Let's Encrypt (Automatic)

Automatic SSL certificate provisioning and renewal.

**Prerequisites:**
- A domain name pointing to your server (DNS A record)
- Ports 80 and 443 open and reachable from the internet

```bash
DOMAIN=charts.example.com ./install.sh --ssl
```

This will:
1. Start nginx with a temporary config for ACME challenge
2. Run certbot to obtain a Let's Encrypt certificate
3. Reconfigure nginx with SSL
4. Start all services
5. Set up automatic renewal (certbot checks every 12 hours)

Certificate renewal is fully automatic. Let's Encrypt certificates are valid for 90 days; certbot renews them before expiry.

### Manual Renewal

```bash
docker compose exec certbot certbot renew
docker compose exec nginx nginx -s reload
```

## Custom Certificate

If you have your own SSL certificate (e.g., from a corporate CA):

1. Place your certificate files:
   ```
   ssl/cert.pem      # Full certificate chain
   ssl/privkey.pem    # Private key
   ```

2. Create a custom nginx config (`nginx-ssl.conf`):

   ```nginx
   server {
       listen 443 ssl http2;
       server_name your.domain.com;

       ssl_certificate     /etc/ssl/cert.pem;
       ssl_certificate_key /etc/ssl/privkey.pem;

       client_max_body_size 10M;

       location /api/auth/ {
           proxy_pass http://frontend:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location /api/ {
           proxy_pass http://api:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location / {
           proxy_pass http://frontend:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }

   server {
       listen 80;
       server_name your.domain.com;
       return 301 https://$server_name$request_uri;
   }
   ```

3. Mount in `docker-compose.yml`:

   ```yaml
   nginx:
     volumes:
       - ./ssl:/etc/ssl:ro
       - ./nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro
   ```

4. Restart: `docker compose up -d`

## Behind a Reverse Proxy

If Karta runs behind an existing reverse proxy (Caddy, Traefik, corporate nginx):

1. Disable the built-in nginx or remove its port mapping
2. Point your proxy to the frontend on port 3000 with split routing:

   ```nginx
   # nginx
   location /api/auth/ { proxy_pass http://karta-frontend:3000; }
   location /api/       { proxy_pass http://karta-api:8000; }
   location /           { proxy_pass http://karta-frontend:3000; }
   ```

   ```
   # Caddy
   charts.example.com {
       handle /api/auth/* { reverse_proxy frontend:3000 }
       handle /api/*      { reverse_proxy api:8000 }
       handle              { reverse_proxy frontend:3000 }
   }
   ```

3. Set the correct `NEXTAUTH_URL` in `.env`:

   ```
   NEXTAUTH_URL=https://charts.example.com
   ```

4. Ensure your proxy forwards: `X-Forwarded-For`, `X-Forwarded-Proto`, `Host`
