"""
Database module for Karta.

Provides SQLAlchemy engine singleton and schema initialization.
"""

import os
import logging

from sqlalchemy import create_engine, text, exc

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://karta:karta@localhost:5432/karta",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=15, max_overflow=5)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    is_admin        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    db_type             TEXT NOT NULL,
    host                TEXT NOT NULL,
    port                INTEGER NOT NULL,
    database_name       TEXT NOT NULL,
    username            TEXT NOT NULL,
    password_encrypted  TEXT NOT NULL,
    ssl_enabled         BOOLEAN DEFAULT FALSE,
    is_system           BOOLEAN DEFAULT FALSE,
    created_by          INTEGER REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboards (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    icon            TEXT DEFAULT '📊',
    url_slug        TEXT NOT NULL UNIQUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_archived     BOOLEAN DEFAULT FALSE,
    filter_layout   JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS charts (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER REFERENCES dashboards(id) ON DELETE CASCADE,
    connection_id   INTEGER REFERENCES connections(id),
    dataset_id      INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    mode            TEXT NOT NULL DEFAULT 'visual',
    chart_type      TEXT,
    chart_config    JSONB DEFAULT '{}',
    chart_code      TEXT DEFAULT '',
    sql_query       TEXT DEFAULT '',
    position_order  INTEGER NOT NULL DEFAULT 0,
    grid_x          INTEGER DEFAULT 0,
    grid_y          INTEGER DEFAULT 0,
    grid_w          INTEGER DEFAULT 6,
    grid_h          INTEGER DEFAULT 4,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS datasets (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER REFERENCES connections(id),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT DEFAULT '',
    sql_query       TEXT NOT NULL,
    cache_ttl       INTEGER NOT NULL DEFAULT 600,
    dataset_type    TEXT NOT NULL DEFAULT 'virtual',
    table_name      TEXT DEFAULT NULL,
    schema_name     TEXT DEFAULT NULL,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_channels (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    channel_type    TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    chart_id        INTEGER REFERENCES charts(id) ON DELETE CASCADE,
    channel_id      INTEGER REFERENCES notification_channels(id),
    schedule        TEXT NOT NULL,
    timezone        TEXT DEFAULT 'Europe/Moscow',
    is_active       BOOLEAN DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    connection_id       INTEGER REFERENCES connections(id),
    channel_id          INTEGER REFERENCES notification_channels(id),
    alert_type          TEXT NOT NULL,
    sql_query           TEXT NOT NULL,
    condition_column    TEXT,
    condition_operator  TEXT,
    condition_value     FLOAT,
    anomaly_config      JSONB DEFAULT '{}',
    schedule            TEXT NOT NULL,
    timezone            TEXT DEFAULT 'Europe/Moscow',
    severity            TEXT DEFAULT 'warning',
    is_active           BOOLEAN DEFAULT TRUE,
    last_run_at         TIMESTAMPTZ,
    last_value          FLOAT,
    created_by          INTEGER REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_history (
    id              SERIAL PRIMARY KEY,
    alert_rule_id   INTEGER REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_at    TIMESTAMPTZ DEFAULT NOW(),
    severity        TEXT NOT NULL,
    current_value   FLOAT,
    threshold_value FLOAT,
    message         TEXT NOT NULL,
    notification_sent BOOLEAN DEFAULT FALSE,
    details         JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS dashboard_filters (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    filter_type     TEXT NOT NULL DEFAULT 'select',
    target_column   TEXT NOT NULL,
    default_value   TEXT,
    sort_order      INTEGER DEFAULT 0,
    config          JSONB DEFAULT '{}',
    group_name      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS view_events (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER NOT NULL,
    viewed_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_view_events_entity ON view_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_view_events_user ON view_events(user_id);

CREATE TABLE IF NOT EXISTS rls_rules (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    table_name      TEXT NOT NULL,
    column_name     TEXT NOT NULL,
    user_id         INTEGER REFERENCES users(id),
    group_name      TEXT,
    filter_value    TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    filter_state    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, dashboard_id, name)
);

CREATE TABLE IF NOT EXISTS change_history (
    id              SERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER NOT NULL,
    user_id         INTEGER REFERENCES users(id),
    action          TEXT NOT NULL,
    changes         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_change_history_entity ON change_history(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS annotations (
    id              SERIAL PRIMARY KEY,
    chart_id        INTEGER REFERENCES charts(id) ON DELETE CASCADE,
    dashboard_id    INTEGER REFERENCES dashboards(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    annotation_type TEXT NOT NULL DEFAULT 'comment',
    content         TEXT NOT NULL DEFAULT '',
    x_value         TEXT,
    y_value         TEXT,
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_annotations_chart ON annotations(chart_id);
CREATE INDEX IF NOT EXISTS idx_annotations_dashboard ON annotations(dashboard_id);

CREATE TABLE IF NOT EXISTS stories (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    dashboard_id    INTEGER REFERENCES dashboards(id),
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_slides (
    id              SERIAL PRIMARY KEY,
    story_id        INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    slide_order     INTEGER NOT NULL DEFAULT 0,
    chart_id        INTEGER REFERENCES charts(id),
    title           TEXT DEFAULT '',
    narrative       TEXT DEFAULT '',
    filter_state    JSONB DEFAULT '{}',
    config          JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_charts_dashboard ON charts(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_charts_updated ON charts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(alert_rule_id);
CREATE INDEX IF NOT EXISTS idx_rls_rules_conn_user ON rls_rules(connection_id, user_id);
CREATE INDEX IF NOT EXISTS idx_view_events_viewed_at ON view_events(viewed_at);

ALTER TABLE connections ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sqlalchemy_uri TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS extra_params JSONB DEFAULT '{}';

ALTER TABLE charts ALTER COLUMN dashboard_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS shared_links (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    token           TEXT UNIQUE NOT NULL,
    created_by      INTEGER REFERENCES users(id),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shared_links ADD COLUMN IF NOT EXISTS chart_id INTEGER REFERENCES charts(id) ON DELETE CASCADE;
ALTER TABLE shared_links ALTER COLUMN dashboard_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS sql_tabs (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         TEXT NOT NULL DEFAULT 'Untitled',
    connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
    sql_query     TEXT DEFAULT '',
    sort_order    INTEGER DEFAULT 0,
    is_active     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chart_drafts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id        INTEGER REFERENCES charts(id) ON DELETE CASCADE,
    dashboard_id    INTEGER REFERENCES dashboards(id) ON DELETE SET NULL,
    connection_id   INTEGER REFERENCES connections(id) ON DELETE SET NULL,
    dataset_id      INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
    title           TEXT DEFAULT 'New Chart',
    description     TEXT DEFAULT '',
    mode            TEXT DEFAULT 'visual',
    chart_type      TEXT DEFAULT 'bar',
    chart_config    JSONB DEFAULT '{}',
    chart_code      TEXT DEFAULT '',
    sql_query       TEXT DEFAULT '',
    variables       JSONB DEFAULT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, chart_id)
);

ALTER TABLE chart_drafts ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT NULL;

ALTER TABLE dashboard_filters ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS filter_layout JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS dashboard_tabs (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'New Tab',
    position_order  INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE charts ADD COLUMN IF NOT EXISTS tab_id INTEGER REFERENCES dashboard_tabs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dashboard_tabs_dashboard ON dashboard_tabs(dashboard_id);

CREATE TABLE IF NOT EXISTS ai_sessions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT DEFAULT '',
    context_type    TEXT,
    context_id      INTEGER,
    connection_id   INTEGER REFERENCES connections(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    tool_calls      JSONB,
    sql_query       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS groups TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS favorites (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

CREATE TABLE IF NOT EXISTS chart_templates (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    chart_type      TEXT NOT NULL,
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_glossary (
    id              SERIAL PRIMARY KEY,
    term            TEXT NOT NULL,
    definition      TEXT NOT NULL,
    sql_hint        TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE charts ALTER COLUMN grid_h SET DEFAULT 224;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS dataset_type TEXT NOT NULL DEFAULT 'virtual';
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS table_name TEXT DEFAULT NULL;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS schema_name TEXT DEFAULT NULL;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS color_scheme TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS dashboard_owners (
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(dashboard_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_owners_dashboard ON dashboard_owners(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_owners_user ON dashboard_owners(user_id);

CREATE TABLE IF NOT EXISTS dashboard_roles (
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    group_name      TEXT NOT NULL,
    UNIQUE(dashboard_id, group_name)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_roles_dashboard ON dashboard_roles(dashboard_id);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer', 'sql_lab')),
    UNIQUE(user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

ALTER TABLE charts ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]';

ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS format VARCHAR(10) DEFAULT 'excel';

-- Advanced RBAC: user role column and teams
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'editor';

CREATE TABLE IF NOT EXISTS teams (
    id          SERIAL PRIMARY KEY,
    tenant_id   INTEGER,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id       SERIAL PRIMARY KEY,
    team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'viewer',
    UNIQUE(team_id, user_id)
);

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS team_id INTEGER;

CREATE TABLE IF NOT EXISTS dataset_measures (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    expression      TEXT NOT NULL,
    agg_type        TEXT NOT NULL,
    format          TEXT DEFAULT '',
    filters         JSONB DEFAULT '[]',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(dataset_id, name)
);

CREATE TABLE IF NOT EXISTS dataset_dimensions (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    column_name     TEXT NOT NULL,
    dimension_type  TEXT NOT NULL DEFAULT 'categorical',
    time_grain      TEXT,
    format          TEXT DEFAULT '',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(dataset_id, name)
);

CREATE TABLE IF NOT EXISTS dashboard_versions (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    label           TEXT DEFAULT '',
    is_auto         BOOLEAN DEFAULT TRUE,
    snapshot        JSONB NOT NULL,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dashboard_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_versions_dashboard
    ON dashboard_versions(dashboard_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_filters_dashboard ON dashboard_filters(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_dashboard ON bookmarks(user_id, dashboard_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sql_tabs_user ON sql_tabs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_filters_dashboard_order ON dashboard_filters(dashboard_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_charts_dataset ON charts(dataset_id);
CREATE INDEX IF NOT EXISTS idx_charts_dashboard_order ON charts(dashboard_id, position_order);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active, id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(is_active, id);

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   INTEGER,
    user_id     INTEGER,
    action      TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    details     JSONB DEFAULT '{}',
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    schema_name TEXT UNIQUE NOT NULL,
    settings    JSONB DEFAULT '{}',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS sso_providers (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER DEFAULT 1,
    provider_type   TEXT NOT NULL,
    name            TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                      SERIAL PRIMARY KEY,
    tenant_id               INTEGER DEFAULT 1,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    tier                    TEXT NOT NULL DEFAULT 'community',
    status                  TEXT NOT NULL DEFAULT 'active',
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS model_joins;
DROP TABLE IF EXISTS model_measures;
DROP TABLE IF EXISTS model_dimensions;
DROP TABLE IF EXISTS semantic_models;
"""


def ensure_schema():
    """Create all tables if they do not exist.

    Uses savepoints so that a concurrent-DDL race (e.g. two workers
    trying to CREATE INDEX simultaneously) doesn't abort the whole
    transaction.
    """
    with engine.connect() as conn:
        for statement in SCHEMA_SQL.strip().split(";"):
            statement = statement.strip()
            if statement:
                try:
                    conn.execute(text("SAVEPOINT sp"))
                    conn.execute(text(statement))
                    conn.execute(text("RELEASE SAVEPOINT sp"))
                except (exc.ProgrammingError, exc.IntegrityError, exc.OperationalError):
                    conn.execute(text("ROLLBACK TO SAVEPOINT sp"))

        # Create default tenant if none exists
        try:
            conn.execute(text("SAVEPOINT sp_tenant"))
            result = conn.execute(text("SELECT COUNT(*) FROM tenants")).fetchone()
            if result[0] == 0:
                conn.execute(text("""
                    INSERT INTO tenants (name, slug, schema_name, settings)
                    VALUES ('Default', 'default', 'public', '{}')
                """))
                logger.info("Created default tenant")
            conn.execute(text("RELEASE SAVEPOINT sp_tenant"))
        except (exc.ProgrammingError, exc.IntegrityError, exc.OperationalError):
            conn.execute(text("ROLLBACK TO SAVEPOINT sp_tenant"))

        conn.commit()


# ---------------------------------------------------------------------------
# Per-tenant schema DDL (scaffolding for future schema-per-tenant isolation)
# ---------------------------------------------------------------------------
# These are the tables that will eventually live in each tenant_<id> schema.
# For now, all tables remain in the public schema; this constant defines the
# target DDL for when schema isolation is enabled.
TENANT_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS dashboards (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    icon            TEXT DEFAULT '📊',
    url_slug        TEXT NOT NULL UNIQUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_archived     BOOLEAN DEFAULT FALSE,
    filter_layout   JSONB DEFAULT '{}',
    color_scheme    TEXT DEFAULT NULL,
    team_id         INTEGER,
    is_public       BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS connections (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    db_type             TEXT NOT NULL,
    host                TEXT NOT NULL,
    port                INTEGER NOT NULL,
    database_name       TEXT NOT NULL,
    username            TEXT NOT NULL,
    password_encrypted  TEXT NOT NULL,
    ssl_enabled         BOOLEAN DEFAULT FALSE,
    is_system           BOOLEAN DEFAULT FALSE,
    sqlalchemy_uri      TEXT,
    extra_params        JSONB DEFAULT '{}',
    team_id             INTEGER,
    created_by          INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS datasets (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER REFERENCES connections(id),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT DEFAULT '',
    sql_query       TEXT NOT NULL,
    cache_ttl       INTEGER NOT NULL DEFAULT 600,
    dataset_type    TEXT NOT NULL DEFAULT 'virtual',
    table_name      TEXT DEFAULT NULL,
    schema_name     TEXT DEFAULT NULL,
    metadata        JSONB DEFAULT '{}',
    team_id         INTEGER,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS charts (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER REFERENCES dashboards(id) ON DELETE CASCADE,
    connection_id   INTEGER REFERENCES connections(id),
    dataset_id      INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    mode            TEXT NOT NULL DEFAULT 'visual',
    chart_type      TEXT,
    chart_config    JSONB DEFAULT '{}',
    chart_code      TEXT DEFAULT '',
    sql_query       TEXT DEFAULT '',
    position_order  INTEGER NOT NULL DEFAULT 0,
    grid_x          INTEGER DEFAULT 0,
    grid_y          INTEGER DEFAULT 0,
    grid_w          INTEGER DEFAULT 6,
    grid_h          INTEGER DEFAULT 224,
    tab_id          INTEGER,
    variables       JSONB DEFAULT '[]',
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_filters (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    filter_type     TEXT NOT NULL DEFAULT 'select',
    target_column   TEXT NOT NULL,
    default_value   TEXT,
    sort_order      INTEGER DEFAULT 0,
    config          JSONB DEFAULT '{}',
    group_name      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_tabs (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'New Tab',
    position_order  INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_versions (
    id              SERIAL PRIMARY KEY,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    label           TEXT DEFAULT '',
    is_auto         BOOLEAN DEFAULT TRUE,
    snapshot        JSONB NOT NULL,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dashboard_id, version_number)
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    connection_id       INTEGER REFERENCES connections(id),
    channel_id          INTEGER,
    alert_type          TEXT NOT NULL,
    sql_query           TEXT NOT NULL,
    condition_column    TEXT,
    condition_operator  TEXT,
    condition_value     FLOAT,
    anomaly_config      JSONB DEFAULT '{}',
    schedule            TEXT NOT NULL,
    timezone            TEXT DEFAULT 'Europe/Moscow',
    severity            TEXT DEFAULT 'warning',
    is_active           BOOLEAN DEFAULT TRUE,
    last_run_at         TIMESTAMPTZ,
    last_value          FLOAT,
    created_by          INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_history (
    id              SERIAL PRIMARY KEY,
    alert_rule_id   INTEGER REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_at    TIMESTAMPTZ DEFAULT NOW(),
    severity        TEXT NOT NULL,
    current_value   FLOAT,
    threshold_value FLOAT,
    message         TEXT NOT NULL,
    notification_sent BOOLEAN DEFAULT FALSE,
    details         JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    chart_id        INTEGER REFERENCES charts(id) ON DELETE CASCADE,
    channel_id      INTEGER,
    schedule        TEXT NOT NULL,
    timezone        TEXT DEFAULT 'Europe/Moscow',
    format          VARCHAR(10) DEFAULT 'excel',
    is_active       BOOLEAN DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_channels (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    channel_type    TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rls_rules (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    table_name      TEXT NOT NULL,
    column_name     TEXT NOT NULL,
    user_id         INTEGER,
    group_name      TEXT,
    filter_value    TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    dashboard_id    INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    filter_state    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, dashboard_id, name)
);

CREATE TABLE IF NOT EXISTS stories (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    dashboard_id    INTEGER REFERENCES dashboards(id),
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_slides (
    id              SERIAL PRIMARY KEY,
    story_id        INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    slide_order     INTEGER NOT NULL DEFAULT 0,
    chart_id        INTEGER REFERENCES charts(id),
    title           TEXT DEFAULT '',
    narrative       TEXT DEFAULT '',
    filter_state    JSONB DEFAULT '{}',
    config          JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS annotations (
    id              SERIAL PRIMARY KEY,
    chart_id        INTEGER REFERENCES charts(id) ON DELETE CASCADE,
    dashboard_id    INTEGER REFERENCES dashboards(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL,
    annotation_type TEXT NOT NULL DEFAULT 'comment',
    content         TEXT NOT NULL DEFAULT '',
    x_value         TEXT,
    y_value         TEXT,
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id       SERIAL PRIMARY KEY,
    team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL,
    role     TEXT NOT NULL DEFAULT 'viewer',
    UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS dataset_measures (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    expression      TEXT NOT NULL,
    agg_type        TEXT NOT NULL,
    format          TEXT DEFAULT '',
    filters         JSONB DEFAULT '[]',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(dataset_id, name)
);

CREATE TABLE IF NOT EXISTS dataset_dimensions (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    column_name     TEXT NOT NULL,
    dimension_type  TEXT NOT NULL DEFAULT 'categorical',
    time_grain      TEXT,
    format          TEXT DEFAULT '',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(dataset_id, name)
);
"""


def ensure_tenant_schema(tenant_id: int):
    """Create a tenant schema and run per-tenant DDL.

    This is scaffolding for future schema-per-tenant isolation.
    For now, the default tenant uses the public schema, so this
    function is only called when creating additional tenants.
    """
    schema = f"tenant_{tenant_id}"
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.execute(text(f"SET search_path = {schema}, public"))
        for stmt in TENANT_SCHEMA_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                try:
                    conn.execute(text("SAVEPOINT sp_t"))
                    conn.execute(text(stmt))
                    conn.execute(text("RELEASE SAVEPOINT sp_t"))
                except (exc.ProgrammingError, exc.IntegrityError, exc.OperationalError):
                    conn.execute(text("ROLLBACK TO SAVEPOINT sp_t"))
        conn.commit()
    logger.info("Ensured tenant schema '%s' for tenant_id=%d", schema, tenant_id)


# Old grid: rowHeight=40, margin=16 → each unit = 56px.
# New grid: rowHeight=1, margin=0 → each unit = 1px.
_GRID_SCALE = 56

def ensure_migrations():
    """Run one-time data migrations after schema is ready."""
    with engine.connect() as conn:
        # grid_to_pixels: convert chart grid_h / grid_y from coarse grid units to pixels.
        # Use INSERT ON CONFLICT to safely handle concurrent workers.
        result = conn.execute(text(
            "INSERT INTO schema_migrations (name) VALUES ('grid_to_pixels_v1') ON CONFLICT DO NOTHING"
        ))
        if result.rowcount > 0:
            conn.execute(text(
                "UPDATE charts SET grid_h = grid_h * :scale, grid_y = grid_y * :scale"
            ), {"scale": _GRID_SCALE})
            logger.info("Migration grid_to_pixels_v1: converted grid values to pixel units (scale=%d)", _GRID_SCALE)

        # Assign orphan charts (tab_id IS NULL) to the first tab of their dashboard
        orphans = conn.execute(text("""
            UPDATE charts c
            SET tab_id = dt.id
            FROM (
                SELECT DISTINCT ON (dashboard_id) id, dashboard_id
                FROM dashboard_tabs
                ORDER BY dashboard_id, position_order
            ) dt
            WHERE c.dashboard_id = dt.dashboard_id AND c.tab_id IS NULL
        """))
        if orphans.rowcount > 0:
            logger.info("Assigned %d orphan charts to their dashboard's first tab", orphans.rowcount)

        # RBAC v1: populate user_roles from is_admin flag
        result = conn.execute(text(
            "INSERT INTO schema_migrations (name) VALUES ('rbac_v1') ON CONFLICT DO NOTHING"
        ))
        if result.rowcount > 0:
            # Admin users get all roles
            conn.execute(text("""
                INSERT INTO user_roles (user_id, role)
                SELECT id, unnest(ARRAY['admin', 'editor', 'viewer', 'sql_lab'])
                FROM users WHERE is_admin = true
                ON CONFLICT DO NOTHING
            """))
            # Non-admin users get editor + viewer + sql_lab
            conn.execute(text("""
                INSERT INTO user_roles (user_id, role)
                SELECT id, unnest(ARRAY['editor', 'viewer', 'sql_lab'])
                FROM users WHERE is_admin = false
                ON CONFLICT DO NOTHING
            """))
            logger.info("Migration rbac_v1: populated user_roles from is_admin flag")

        # RBAC v2: sync is_admin → users.role column
        result = conn.execute(text(
            "INSERT INTO schema_migrations (name) VALUES ('rbac_v2_role_column') ON CONFLICT DO NOTHING"
        ))
        if result.rowcount > 0:
            conn.execute(text("""
                UPDATE users SET role = 'admin'
                WHERE is_admin = true AND (role IS NULL OR role = 'editor')
            """))
            logger.info("Migration rbac_v2_role_column: synced is_admin → users.role")

        conn.commit()


# Path to the shared DuckDB file for uploaded data
SHARED_DUCKDB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "csv", "uploads.duckdb"
)


def ensure_system_connections():
    """Ensure the shared DuckDB connection exists (created on startup, not on first upload)."""
    from api.crypto import encrypt_password_safe

    os.makedirs(os.path.dirname(SHARED_DUCKDB_PATH), exist_ok=True)

    # Create the DuckDB file if it doesn't exist (read_only opens will fail otherwise)
    if not os.path.exists(SHARED_DUCKDB_PATH):
        import duckdb
        duckdb.connect(SHARED_DUCKDB_PATH).close()

    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, is_system FROM connections WHERE db_type = 'duckdb' AND (database_name = :path OR is_system = true)"),
                {"path": SHARED_DUCKDB_PATH},
            ).fetchone()

            if row:
                if not row[1]:
                    conn.execute(
                        text("UPDATE connections SET is_system = TRUE WHERE id = :id"),
                        {"id": row[0]},
                    )
                    conn.commit()
                return

            password_encrypted = encrypt_password_safe("")
            conn.execute(
                text("""
                    INSERT INTO connections (name, db_type, host, port, database_name,
                        username, password_encrypted, ssl_enabled, is_system)
                    VALUES ('Uploaded Files', 'duckdb', '', 0, :database_name,
                        '', :password_encrypted, false, true)
                """),
                {
                    "database_name": SHARED_DUCKDB_PATH,
                    "password_encrypted": password_encrypted,
                },
            )
            conn.commit()
            logger.info("Created system DuckDB connection for uploaded files")
    except Exception:
        # Another worker may have already created it — safe to ignore
        pass
