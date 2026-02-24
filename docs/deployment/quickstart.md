# Quick Start Deployment

## Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **CPU** | 1 vCPU | 2+ vCPU |
| **RAM** | 2 GB | 4 GB |
| **Disk** | 10 GB | 20+ GB |
| **OS** | Any Linux with Docker | Ubuntu 22.04+ / Debian 12+ |
| **Docker** | 20.10+ | Latest stable |
| **Docker Compose** | v2.0+ | Latest stable |

## Install

```bash
git clone https://github.com/anshauklis/karta.git
cd karta
./install.sh
```

The install script:

1. Verifies Docker and Docker Compose are installed and running
2. Creates `.env` from `.env.example` (if it doesn't exist)
3. Generates cryptographically secure secrets:
   - `JWT_SECRET` — 32-byte base64 for JWT token signing
   - `CONNECTION_SECRET` — 32-byte base64 for AES-256-GCM encryption
   - `POSTGRES_PASSWORD` — 24-character alphanumeric
4. Builds and starts all containers
5. Prints access instructions

Open `http://localhost` (or `http://<server-ip>`). The first user to register becomes the admin.

## Custom Port

To change the default port from 80:

```bash
# In .env
PORT=8080
```

Then restart:

```bash
docker compose up -d
```
