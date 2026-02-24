from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime
from typing import Optional


# --- Auth ---

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    groups: str = ""
    roles: list[str] = []
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class SetupStatus(BaseModel):
    needs_setup: bool

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    is_admin: bool = False
    groups: str = ""
    roles: list[str] | None = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    groups: Optional[str] = None
    roles: list[str] | None = None

class RoleUpdate(BaseModel):
    roles: list[str]


# --- Dashboards ---

class DashboardCreate(BaseModel):
    title: str
    description: str = ""
    icon: str = "📊"

class DashboardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    filter_layout: Optional[dict] = None
    url_slug: Optional[str] = None
    color_scheme: Optional[str] = None
    owner_ids: Optional[list[int]] = None
    roles: Optional[list[str]] = None

class DashboardOwnerResponse(BaseModel):
    id: int
    email: str
    name: str

class DashboardResponse(BaseModel):
    id: int
    title: str
    description: str
    icon: str
    url_slug: str
    sort_order: int
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    filter_layout: dict = {}
    chart_count: int = 0
    color_scheme: Optional[str] = None
    owners: list[DashboardOwnerResponse] = []
    roles: list[str] = []
    model_config = ConfigDict(from_attributes=True)


# --- Charts ---

class ChartCreate(BaseModel):
    title: str
    description: str = ""
    dashboard_id: Optional[int] = None
    connection_id: Optional[int] = None
    dataset_id: Optional[int] = None
    mode: str = "visual"
    chart_type: Optional[str] = None
    chart_config: dict = {}
    chart_code: str = ""
    sql_query: str = ""
    tab_id: Optional[int] = None

class QuickChartCreate(BaseModel):
    """One-shot chart creation: SQL + title + chart_type → dataset + chart in one call."""
    connection_id: int
    sql_query: str
    title: str
    chart_type: str = "bar"
    x_column: Optional[str] = None
    y_columns: Optional[list[str]] = None
    color_column: Optional[str] = None
    aggregate: str = "SUM"
    dashboard_id: Optional[int] = None
    dataset_name: Optional[str] = None


class ChartCloneRequest(BaseModel):
    target_dashboard_id: int | None = None
    target_tab_id: int | None = None
    title: str | None = None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


class ChartUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    dashboard_id: Optional[int] = None
    connection_id: Optional[int] = None
    dataset_id: Optional[int] = None
    mode: Optional[str] = None
    chart_type: Optional[str] = None
    chart_config: Optional[dict] = None
    chart_code: Optional[str] = None
    sql_query: Optional[str] = None
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    grid_w: Optional[int] = None
    grid_h: Optional[int] = None

class ChartResponse(BaseModel):
    id: int
    dashboard_id: Optional[int] = None
    connection_id: Optional[int]
    dataset_id: Optional[int] = None
    title: str
    description: str
    mode: str
    chart_type: Optional[str]
    chart_config: dict
    chart_code: str
    sql_query: str
    position_order: int
    grid_x: int
    grid_y: int
    grid_w: int
    grid_h: int
    tab_id: Optional[int] = None
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LayoutItem(BaseModel):
    id: int
    grid_x: int
    grid_y: int
    grid_w: int
    grid_h: int

class LayoutUpdate(BaseModel):
    items: list[LayoutItem]


# --- Dashboard Tabs ---

class TabCreate(BaseModel):
    title: str = "New Tab"
    position_order: int = 0

class TabUpdate(BaseModel):
    title: Optional[str] = None
    position_order: Optional[int] = None

class TabResponse(BaseModel):
    id: int
    dashboard_id: int
    title: str
    position_order: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TabReorder(BaseModel):
    tab_ids: list[int]

class ChartMoveToTab(BaseModel):
    tab_id: Optional[int] = None


# --- Chart Execution ---

class ChartPreviewRequest(BaseModel):
    connection_id: int | None = None
    dataset_id: int | None = None
    sql_query: str = ""
    mode: str = "visual"
    chart_type: str | None = None
    chart_config: dict = {}
    chart_code: str = ""
    filters: dict | None = None

class ChartExecuteRequest(BaseModel):
    filters: dict | None = None
    force: bool = False

class ChartExecuteResponse(BaseModel):
    figure: dict | None = None
    columns: list[str] = []
    rows: list[list] = []
    row_count: int = 0
    error: str | dict | None = None
    formatting: list[dict] = []
    pivot_header_levels: list[list[str]] | None = None
    pivot_row_index_count: int | None = None
    pivot_cond_format_meta: dict | None = None

class ChartConfigValidateRequest(BaseModel):
    chart_type: str
    chart_config: dict

class ChartConfigValidateResponse(BaseModel):
    valid: bool
    errors: list[dict] = []
    warnings: list[dict] = []


# --- Connections ---

class ConnectionCreate(BaseModel):
    name: str
    db_type: str
    host: str
    port: int
    database_name: str
    username: str
    password: str
    ssl_enabled: bool = False

class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssl_enabled: Optional[bool] = None

class ConnectionResponse(BaseModel):
    id: int
    name: str
    db_type: str
    host: str
    port: int
    database_name: str
    username: str
    ssl_enabled: bool
    is_system: bool = False
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ConnectionTestResult(BaseModel):
    success: bool
    message: str

class SchemaColumn(BaseModel):
    name: str
    type: str
    nullable: bool

class SchemaTable(BaseModel):
    table_name: str
    columns: list[SchemaColumn]


# --- SQL Lab ---

class SQLExecuteRequest(BaseModel):
    connection_id: int
    sql: str
    limit: int = 1000

class SQLExecuteResponse(BaseModel):
    columns: list[str]
    rows: list[list]
    row_count: int
    execution_time_ms: int

class SQLValidateRequest(BaseModel):
    connection_id: int
    sql: str

class SQLValidateResponse(BaseModel):
    valid: bool
    error: str | None = None
    columns: list[dict] | None = None


# --- Dashboard Filters ---

class DashboardFilterCreate(BaseModel):
    label: str
    filter_type: str = "select"
    target_column: str
    default_value: Optional[str] = None
    sort_order: int = 0
    config: dict = {}
    group_name: Optional[str] = None

class DashboardFilterUpdate(BaseModel):
    label: Optional[str] = None
    filter_type: Optional[str] = None
    target_column: Optional[str] = None
    default_value: Optional[str] = None
    sort_order: Optional[int] = None
    config: Optional[dict] = None
    group_name: Optional[str] = None

class DashboardFilterResponse(BaseModel):
    id: int
    dashboard_id: int
    label: str
    filter_type: str
    target_column: str
    default_value: Optional[str]
    sort_order: int
    config: dict
    group_name: Optional[str]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FilterReorderItem(BaseModel):
    id: int
    sort_order: int

class FilterReorderRequest(BaseModel):
    items: list[FilterReorderItem]


# --- Datasets ---

class DatasetCreate(BaseModel):
    connection_id: int
    name: str
    description: str = ""
    sql_query: str = ""
    cache_ttl: int = 600
    dataset_type: str = "virtual"
    table_name: Optional[str] = None
    schema_name: Optional[str] = None

class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sql_query: Optional[str] = None
    cache_ttl: Optional[int] = None

class DatasetResponse(BaseModel):
    id: int
    connection_id: Optional[int]
    name: str
    description: str
    sql_query: str
    cache_ttl: int
    dataset_type: str = "virtual"
    table_name: Optional[str] = None
    schema_name: Optional[str] = None
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Usage Analytics ---

class PopularContentItem(BaseModel):
    entity_type: str
    entity_id: int
    title: Optional[str] = None
    views_30d: int
    unique_viewers: int
    last_viewed: Optional[datetime]

class UserActivityItem(BaseModel):
    user_id: int
    user_name: str
    user_email: str
    total_views: int
    last_active: Optional[datetime]

class DashboardStatsResponse(BaseModel):
    total_views: int
    unique_viewers: int
    views_by_day: list[dict]


# --- RLS ---

class RLSRuleCreate(BaseModel):
    connection_id: int
    table_name: str
    column_name: str
    user_id: Optional[int] = None
    group_name: Optional[str] = None
    filter_value: str

class RLSRuleUpdate(BaseModel):
    table_name: Optional[str] = None
    column_name: Optional[str] = None
    user_id: Optional[int] = None
    group_name: Optional[str] = None
    filter_value: Optional[str] = None

class RLSRuleResponse(BaseModel):
    id: int
    connection_id: int
    table_name: str
    column_name: str
    user_id: Optional[int]
    group_name: Optional[str]
    filter_value: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Bookmarks ---

class BookmarkCreate(BaseModel):
    name: str
    filter_state: dict = {}

class BookmarkResponse(BaseModel):
    id: int
    user_id: int
    dashboard_id: int
    name: str
    filter_state: dict
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Change History ---

class ChangeHistoryResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    user_id: Optional[int]
    user_name: Optional[str] = None
    action: str
    changes: dict
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Annotations ---

class AnnotationCreate(BaseModel):
    annotation_type: str = "comment"
    content: str = ""
    x_value: Optional[str] = None
    y_value: Optional[str] = None
    config: dict = {}

class AnnotationResponse(BaseModel):
    id: int
    chart_id: Optional[int]
    dashboard_id: Optional[int]
    user_id: int
    user_name: Optional[str] = None
    annotation_type: str
    content: str
    x_value: Optional[str]
    y_value: Optional[str]
    config: dict
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Stories ---

class StoryCreate(BaseModel):
    title: str
    description: str = ""
    dashboard_id: Optional[int] = None

class StoryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class StorySlideCreate(BaseModel):
    chart_id: Optional[int] = None
    title: str = ""
    narrative: str = ""
    filter_state: dict = {}
    config: dict = {}

class StorySlideUpdate(BaseModel):
    chart_id: Optional[int] = None
    title: Optional[str] = None
    narrative: Optional[str] = None
    slide_order: Optional[int] = None
    filter_state: Optional[dict] = None
    config: Optional[dict] = None

class StorySlideResponse(BaseModel):
    id: int
    story_id: int
    slide_order: int
    chart_id: Optional[int]
    title: str
    narrative: str
    filter_state: dict
    config: dict
    model_config = ConfigDict(from_attributes=True)

class StoryResponse(BaseModel):
    id: int
    title: str
    description: str
    dashboard_id: Optional[int]
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    slide_count: int = 0
    model_config = ConfigDict(from_attributes=True)

class StoryDetailResponse(StoryResponse):
    slides: list[StorySlideResponse] = []


# --- Shared Links ---

class SharedLinkCreate(BaseModel):
    expires_in_hours: Optional[int] = None

class SharedLinkResponse(BaseModel):
    id: int
    dashboard_id: int
    token: str
    created_by: Optional[int]
    expires_at: Optional[datetime]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Lineage ---

class LineageNode(BaseModel):
    id: str
    type: str
    name: str
    meta: dict | None = None

class LineageEdge(BaseModel):
    source: str
    target: str

class LineageResponse(BaseModel):
    nodes: list[LineageNode]
    edges: list[LineageEdge]


# --- SQL Tabs ---

class SQLTabCreate(BaseModel):
    label: Optional[str] = "Untitled"
    connection_id: Optional[int] = None

class SQLTabUpdate(BaseModel):
    label: Optional[str] = None
    connection_id: Optional[int] = None
    sql_query: Optional[str] = None
    is_active: Optional[bool] = None

class SQLTabResponse(BaseModel):
    id: int
    user_id: int
    label: str
    connection_id: Optional[int] = None
    sql_query: str
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

class SQLTabReorderItem(BaseModel):
    id: int
    sort_order: int

class SQLTabReorderRequest(BaseModel):
    items: list[SQLTabReorderItem]


# --- Chart Drafts ---

class ChartDraftUpsert(BaseModel):
    dashboard_id: Optional[int] = None
    connection_id: Optional[int] = None
    dataset_id: Optional[int] = None
    title: str = "New Chart"
    description: str = ""
    mode: str = "visual"
    chart_type: str = "bar"
    chart_config: dict = {}
    chart_code: str = ""
    sql_query: str = ""

class ChartDraftResponse(BaseModel):
    id: int
    user_id: int
    chart_id: Optional[int] = None
    dashboard_id: Optional[int] = None
    connection_id: Optional[int] = None
    dataset_id: Optional[int] = None
    title: str
    description: str
    mode: str
    chart_type: str
    chart_config: dict
    chart_code: str
    sql_query: str
    updated_at: datetime


# --- AI ---

class AIChatRequest(BaseModel):
    session_id: Optional[int] = None
    message: str
    connection_id: Optional[int] = None
    context: Optional[dict] = None

class AIGenerateSQLRequest(BaseModel):
    connection_id: int
    prompt: str
    current_sql: str = ""

class AIFixSQLRequest(BaseModel):
    connection_id: int
    sql: str
    error: str

class AISummarizeRequest(BaseModel):
    chart_type: str = ""
    title: str = ""
    columns: list[str] = []
    rows: list = []
    row_count: int = 0

class AITextResponse(BaseModel):
    text: str
    sql: Optional[str] = None

class AISessionResponse(BaseModel):
    id: int
    title: str
    context_type: Optional[str] = None
    context_id: Optional[int] = None
    connection_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AIMessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    tool_calls: Optional[list] = None
    sql_query: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AIGlossaryCreate(BaseModel):
    term: str
    definition: str
    sql_hint: Optional[str] = None

class AIGlossaryUpdate(BaseModel):
    term: Optional[str] = None
    definition: Optional[str] = None
    sql_hint: Optional[str] = None

class AIGlossaryResponse(BaseModel):
    id: int
    term: str
    definition: str
    sql_hint: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Import/Export ---

class ImportConfirmRequest(BaseModel):
    data: dict
    connection_mapping: dict[str, int]


class ExcelExportRequest(BaseModel):
    columns: list[str]
    rows: list[list]
    filename: str = "data"
    column_formats: dict | None = None
    formatting: list[dict] | None = None
