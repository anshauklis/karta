# Karta — Product Strategy 2026

## Positioning

**One-liner**: Karta — modern open-source BI platform with built-in AI. Power of Superset, simplicity of Metabase, intelligence of the future.

**Model**: Open-core. Free open-source core + paid enterprise tier.

**Target audience**: Both technical (data engineers, analysts with SQL) and business users (no-code dashboards, AI assistant).

**Key differentiators** (vs Superset, Metabase, Redash):
1. **Modern UX** — Next.js 16, shadcn/ui. Не 2015 год.
2. **Built-in AI** — text-to-SQL, AI chart builder, natural language filters. BYO API key.
3. **Easy deploy** — `docker compose up`, 3GB RAM, works on $5 VPS.
4. **Code mode** — Python/Plotly code execution for power users. No competitor has this.
5. **Pivot tables + Custom SQL** — Superset-level power, Metabase-level simplicity.

### Competitive Matrix

| Feature | Superset | Metabase | Redash | Karta |
|---------|---------|----------|--------|-------|
| Modern UI | - | + | - | ++ |
| Code mode (Python/Plotly) | - | - | - | + |
| SQL Lab | + | +/- | + | + |
| Visual chart builder | + | + | - | + |
| AI (text-to-chart) | - | - | - | + |
| Easy deploy | - | + | + | + |
| Pivot tables | +/- | - | - | + |
| Custom SQL expressions | + | - | - | + |
| Self-hosted | + | + | + | + |

### Pitch by Audience

- **Analyst**: "Superset without the pain. SQL Lab + visual builder + Python code mode. Deploys in 5 minutes."
- **Business user**: "Ask AI in plain language — get a chart. Drag-and-drop dashboards. No analyst needed."
- **CTO/DevOps**: "docker compose up. 3GB RAM. All data stays on your servers. Open-source."

---

## Roadmap

### ✅ Q1 (March–May 2026): Foundation + Launch + AI Basics — COMPLETED

**Status**: All planned features shipped + 2 bonus features. Completed ahead of schedule (2026-02-27).

**Delivered**:
- ✅ DuckDB + Parquet pipeline (40M+ rows without OOM)
- ✅ Text-to-SQL in SQL Lab (BYO API key)
- ✅ AI Chat with tools (20+ tools, SSE streaming, session management)
- ✅ AI Chart Builder (description → chart config + visualization)
- ✅ Error handling sweep across all chart types
- ✅ Table chart type (TanStack Table v8, sorting, conditional formatting)
- ✅ Variables/Parameters in SQL (`{{ date_start }}`)
- ✅ Dashboard embed (iframe + token)
- ✅ Scheduled reports (cron → Excel/PNG/PDF → Slack/Telegram/Email)
- ✅ Dark/light/system theme
- ✅ Natural language dashboard filters
- ✅ AI auto-insights (anomalies, trends on dashboard)
- ✅ Responsive mobile view (read-only)
- ✅ Shared dashboard links (JWT tokens, expiration)
- ✅ CI/CD — Docker Hub + GitHub Actions
- ✅ Public launch prep (LICENSE, README, CONTRIBUTING, quickstart)
- ✅ **Bonus**: Loading skeletons & performance polish (route-level, chart-type-aware)
- ✅ **Bonus**: Dashboard DnD polish (8-direction resize, grid guides, layout undo/redo, multi-select + align/distribute)

**Q1 outcome**: Public open-source product with AI, 21+ chart types, embedding, reports, professional edit UX. Competitive with Superset on features, superior on UX and AI.

---

### Q2 (June–August 2026): Growth + Ecosystem + Advanced AI

- Plugin/extension system (custom chart types, custom connectors)
- Embedding SDK (React component `<KartaEmbed />`)
- AI copilot mode (chat with data, follow-up questions)
- Semantic layer (metrics definitions, reusable calculations)
- dbt integration (import models as datasets)
- Slack/Telegram alerts
- Dashboard versioning + undo
- API documentation (OpenAPI + SDK generation)
- Community: Discord, contributing guide, issue templates
- First external contributors

**Q2 outcome**: Ecosystem, AI copilot, integrations. 1,000+ GitHub stars.

---

### Q3 (September–November 2026): Enterprise + Monetization

- SSO/SAML authentication (enterprise tier)
- Audit log (who viewed/edited what)
- Advanced RBAC (workspace-level permissions, teams)
- White-label (custom logo, colors, domain)
- Multi-tenant architecture
- Usage analytics (admin dashboard)
- Pricing page + Stripe billing
- Enterprise landing page
- Managed cloud option (optional — Karta Cloud)
- First paying customers

**Q3 outcome**: Enterprise tier live, first revenue.

---

### Q4 (December 2026 – February 2027): Scale + Moat

- AI agents (scheduled AI analysis, auto-generated reports)
- Real-time dashboards (WebSocket streaming)
- Notebook mode (Jupyter-like cells: SQL → chart → markdown)
- Marketplace for plugins/connectors
- Advanced caching (incremental refresh, query-level cache)
- Performance: 100+ dashboards, 1,000+ users
- SOC2 / security compliance docs
- Partnership program (SI, resellers)

**Q4 outcome**: Mature product, multiple paying customers, growing community.

---

## Key Architectural Decisions

### 1. License: AGPL-3.0
- Protects from "free" SaaS competitors (can't take code and sell as service without open-sourcing)
- Same model as Grafana, MongoDB, Minio
- Enterprise features under separate commercial license (BSL or proprietary)
- Open-core model: everything in one repo, enterprise features behind feature flags

### 2. AI Architecture: BYO-Key + Abstract Provider
- User provides their own API key (OpenAI, Anthropic, local Ollama)
- Abstract interface: `AIProvider.complete(messages)` — easy to add new providers
- Zero server costs for LLM in OSS version
- Enterprise tier: managed AI (we provide key, user pays per-token on top)

### 3. Plugin System: Runtime, Not Compile-Time
- Custom chart types as npm packages (frontend) + Python packages (backend)
- Registration via config, not rebuild
- Start with chart plugins, then connectors, then data transforms
- Marketplace in Q4

### 4. Embedding Architecture
- JWT-based embed tokens (already have `/shared/[token]`)
- Extend: `/embed/[token]?theme=dark&filters=...`
- React SDK: `<KartaEmbed dashboardId="..." token="..." />`
- Iframe-first, SDK is a wrapper

### 5. Enterprise Feature Flags
- Single binary for OSS and Enterprise
- `KARTA_LICENSE` env var (empty = OSS, key = Enterprise)
- Feature checks in code: `if license.has_feature("sso"):...`
- Not a fork, not a separate branch — one repo, one build

---

## Success Metrics

| Metric | Q1 | Q2 | Q3 | Q4 |
|--------|----|----|----|----|
| GitHub stars | 500 | 2,000 | 5,000 | 10,000 |
| Docker pulls/month | 500 | 3,000 | 10,000 | 30,000 |
| Discord members | 100 | 500 | 1,500 | 3,000 |
| Active contributors | 0 | 5 | 15 | 30 |
| Enterprise leads | 0 | 0 | 10 | 30 |
| Paying customers | 0 | 0 | 3 | 10 |
| MRR ($) | 0 | 0 | 3K | 15K |

### Pricing (Q3 launch)

| Tier | Price | Includes |
|------|-------|----------|
| **Community** | Free forever | All core: charts, dashboards, SQL Lab, AI (BYO key), alerts, reports |
| **Team** | $29/user/mo | SSO/SAML, audit log, priority support, advanced permissions |
| **Enterprise** | Custom | White-label, multi-tenant, managed AI, SLA, on-call support |

---

## Key Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Solo dev burnout | High | Critical | Strict scope per quarter. Don't take "one more feature". AI removes routine. |
| AI features become commodity in 6 months | Medium | High | AI as amplifier, not sole differentiator. UX + DX remain. |
| Superset adds good AI | Low | Medium | Superset is a Flask/React class components monolith. They can't move fast. |
| No adoption after launch | Medium | High | Validate before Q3: if <500 stars in 3 months, reassess positioning. |
| Enterprise features distract from core | Medium | Medium | Enterprise — Q3, not earlier. Q1-Q2 is open-source only. |

---

## Resources

- **Team**: Solo developer + AI (Claude), fulltime ~160-180 hrs/month
- **Stack**: Next.js 16 + FastAPI + PostgreSQL + DuckDB + Redis
- **Infra**: Docker Compose (5 services), ~3GB RAM total
