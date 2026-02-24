# Karta Documentation

**Open-source, self-hosted BI platform.**
Connect databases, write SQL, build dashboards — no vendor lock-in.

```{toctree}
:maxdepth: 2
:caption: Getting Started

getting-started
```

```{toctree}
:maxdepth: 2
:caption: Using Karta

user-guide/connections
user-guide/sql-lab
user-guide/dashboards
user-guide/charts
user-guide/data-analysis
user-guide/export
user-guide/collaboration
user-guide/filters
user-guide/datasets
```

```{toctree}
:maxdepth: 2
:caption: Administration

admin/users
admin/rls
admin/alerts-reports
```

```{toctree}
:maxdepth: 2
:caption: Deployment

deployment/quickstart
deployment/ssl
deployment/configuration
deployment/architecture
deployment/operations
deployment/security
deployment/scaling
deployment/cloud
```

```{toctree}
:maxdepth: 1
:caption: Reference

reference/keyboard-shortcuts
reference/chart-types
reference/troubleshooting
```

## Quick Start

```bash
git clone https://github.com/anshauklis/karta.git
cd karta
./install.sh
```

Open [http://localhost](http://localhost) and create your admin account on the setup screen.

## Feature Highlights

::::{grid} 2
:gutter: 3

:::{grid-item-card} 21 Chart Types
Bar, line, area, pie, scatter, heatmap, box plot, violin, pareto, control chart, pivot table, and more.
:::

:::{grid-item-card} Visual Builder
Point-and-click chart configuration with 6 color palettes, statistical overlays, and data transforms.
:::

:::{grid-item-card} SQL Lab
Full-featured SQL editor with Monaco, schema browser, autocomplete, and CSV export.
:::

:::{grid-item-card} Dark Mode
System/light/dark themes with full Plotly chart support.
:::

:::{grid-item-card} Sharing & Collaboration
Public share links, dashboard and chart comments, stories, and change history.
:::

:::{grid-item-card} Security
JWT auth, row-level security, AES-256-GCM credential encryption, SQL validation, Python sandbox.
:::

::::
