# Getting Started

## Installation

```bash
git clone https://github.com/anshauklis/karta.git
cd karta
./install.sh
```

The install script:

1. Verifies Docker and Docker Compose are installed and running
2. Creates `.env` from `.env.example` (if it doesn't exist)
3. Generates cryptographically secure secrets:
   - `JWT_SECRET` — 32-byte base64 (for JWT token signing)
   - `CONNECTION_SECRET` — 32-byte base64 (for AES-256-GCM encryption of DB passwords)
   - `POSTGRES_PASSWORD` — 24-character alphanumeric
4. Builds and starts all containers

Open [http://localhost](http://localhost) when the build completes.

## First-Time Setup

1. **Create an admin account** — enter your name, email, and password on the setup screen. This becomes the first admin user.
2. **Welcome wizard** — the home screen shows a 3-step guide:
   - **Connect a Database** — add at least one data source
   - **Create a Dashboard** — set up your first dashboard
   - **Build Charts** — add visualizations to your dashboard
3. You can dismiss the wizard at any time. It won't appear again once you create your first dashboard.

## Navigation

- **Sidebar** (left) — access all sections: Dashboards, Connections, SQL Lab, Datasets, Alerts, Reports, Stories, and admin tools
- **Command Palette** ({kbd}`Cmd+K` / {kbd}`Ctrl+K`) — quick search across dashboards, pages, and navigation
- **Favorites** — starred dashboards appear in a dedicated sidebar section for quick access
- **Dark Mode** — toggle between light, dark, and system themes using the theme switcher at the bottom of the sidebar

## Next Steps

- {doc}`user-guide/connections` — connect your first database
- {doc}`user-guide/sql-lab` — explore your data with SQL
- {doc}`user-guide/dashboards` — create your first dashboard
- {doc}`user-guide/charts` — build visualizations
