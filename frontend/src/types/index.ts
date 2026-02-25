export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  roles: string[];
  groups: string;
  created_at: string;
}

export interface UserCreate {
  name: string;
  email: string;
  password: string;
  is_admin?: boolean;
  groups?: string;
  roles?: string[];
}

export interface UserUpdate {
  name?: string;
  email?: string;
  password?: string;
  is_admin?: boolean;
  groups?: string;
  roles?: string[];
}

export interface DashboardOwner {
  id: number;
  email: string;
  name: string;
}

export interface Dashboard {
  id: number;
  title: string;
  description: string;
  icon: string;
  url_slug: string;
  sort_order: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  filter_layout: Record<string, unknown>;
  chart_count: number;
  color_scheme: string | null;
  owners: DashboardOwner[];
  roles: string[];
}

export interface Chart {
  id: number;
  dashboard_id: number;
  connection_id: number | null;
  dataset_id: number | null;
  title: string;
  description: string;
  mode: "visual" | "code";
  chart_type: string | null;
  chart_config: Record<string, unknown>;
  chart_code: string;
  sql_query: string;
  position_order: number;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  tab_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

// --- Dashboard Tabs ---

export interface DashboardTab {
  id: number;
  dashboard_id: number;
  title: string;
  position_order: number;
  created_at: string;
}

export interface TabCreate {
  title?: string;
  position_order?: number;
}

export interface SetupStatus {
  needs_setup: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// --- Connections ---

export interface Connection {
  id: number;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  ssl_enabled: boolean;
  is_system: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionCreate {
  name: string;
  db_type: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  ssl_enabled?: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface SchemaTable {
  table_name: string;
  columns: SchemaColumn[];
}

// --- SQL Lab ---

export interface SQLResult {
  columns: string[];
  rows: (string | number | null)[][];
  row_count: number;
  execution_time_ms: number;
}

// --- Datasets ---

export interface Dataset {
  id: number;
  connection_id: number | null;
  name: string;
  description: string;
  sql_query: string;
  cache_ttl: number;
  dataset_type: "virtual" | "physical";
  table_name: string | null;
  schema_name: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetCreate {
  connection_id: number;
  name: string;
  description?: string;
  sql_query?: string;
  cache_ttl?: number;
  dataset_type?: "virtual" | "physical";
  table_name?: string;
  schema_name?: string;
}

export interface DatasetUpdate {
  name?: string;
  description?: string;
  sql_query?: string;
  cache_ttl?: number;
}

// --- Chart Operations ---

export interface ChartCreate {
  title: string;
  description?: string;
  connection_id?: number;
  dataset_id?: number;
  mode?: "visual" | "code";
  chart_type?: string;
  chart_config?: Record<string, unknown>;
  chart_code?: string;
  sql_query?: string;
  tab_id?: number | null;
}

export interface ChartUpdate extends Partial<ChartCreate> {
  grid_x?: number;
  grid_y?: number;
  grid_w?: number;
  grid_h?: number;
}

export interface ChartMetric {
  column: string;
  aggregate: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "COUNT_DISTINCT";
  label: string;
  expressionType?: "simple" | "custom_sql";
  sqlExpression?: string;
}

export interface ColumnFormat {
  type: "number" | "percent" | "currency" | "date" | "text";
  decimals?: number;
  prefix?: string;
  suffix?: string;
  thousands?: boolean;
  date_pattern?: string; // DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY, DD Mon YYYY
}

export interface ConditionalFormatRule {
  column: string;
  columns?: string[]; // bulk-select: apply to multiple columns
  type: "color_scale" | "threshold";
  min_color?: string;
  max_color?: string;
  rules?: { op: string; value: number; color: string; text_color?: string }[];
}

export interface ChartExecuteResult {
  figure: Record<string, unknown> | null;
  columns: string[];
  rows: (string | number | null)[][];
  row_count: number;
  error: string | { code: string; message: string; field?: string; suggestion?: string } | null;
  formatting?: ConditionalFormatRule[];
  pivot_header_levels?: string[][];
  pivot_row_index_count?: number;
  pivot_cond_format_meta?: Record<string, { min: number; max: number; mean: number }>;
}

export interface ChartPreviewRequest {
  connection_id?: number;
  dataset_id?: number;
  sql_query?: string;
  mode?: "visual" | "code";
  chart_type?: string;
  chart_config?: Record<string, unknown>;
  chart_code?: string;
}

export interface LayoutItem {
  id: number;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
}

// --- Notification Channels ---

export interface NotificationChannel {
  id: number;
  name: string;
  channel_type: "slack" | "telegram" | "email";
  config: Record<string, string>;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
}

export interface ChannelCreate {
  name: string;
  channel_type: "slack" | "telegram" | "email";
  config: Record<string, string>;
}

export interface ChannelUpdate {
  name?: string;
  config?: Record<string, string>;
  is_active?: boolean;
}

// --- Alert Rules ---

export interface AlertRule {
  id: number;
  name: string;
  connection_id: number;
  channel_id: number | null;
  alert_type: "threshold" | "anomaly";
  sql_query: string;
  condition_column: string | null;
  condition_operator: string | null;
  condition_value: number | null;
  anomaly_config: Record<string, unknown>;
  schedule: string;
  timezone: string;
  severity: string;
  is_active: boolean;
  last_run_at: string | null;
  last_value: number | null;
  created_by: number | null;
  created_at: string;
}

export interface AlertRuleCreate {
  name: string;
  connection_id: number;
  channel_id?: number | null;
  alert_type: "threshold" | "anomaly";
  sql_query: string;
  condition_column?: string | null;
  condition_operator?: string | null;
  condition_value?: number | null;
  anomaly_config?: Record<string, unknown>;
  schedule: string;
  timezone?: string;
  severity?: string;
  is_active?: boolean;
}

export interface AlertRuleUpdate {
  name?: string;
  connection_id?: number;
  channel_id?: number | null;
  alert_type?: "threshold" | "anomaly";
  sql_query?: string;
  condition_column?: string | null;
  condition_operator?: string | null;
  condition_value?: number | null;
  anomaly_config?: Record<string, unknown>;
  schedule?: string;
  timezone?: string;
  severity?: string;
  is_active?: boolean;
}

export interface AlertHistory {
  id: number;
  alert_rule_id: number;
  triggered_at: string;
  severity: string;
  current_value: number | null;
  threshold_value: number | null;
  message: string;
  notification_sent: boolean;
  details: Record<string, unknown>;
  alert_name?: string;
}

// --- Scheduled Reports ---

export interface ScheduledReport {
  id: number;
  name: string;
  chart_id: number;
  channel_id: number | null;
  schedule: string;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  created_by: number | null;
  created_at: string;
  chart_title?: string;
  channel_name?: string;
}

// --- Dashboard Filters ---

export interface DashboardFilter {
  id: number;
  dashboard_id: number;
  label: string;
  filter_type: "select" | "multi_select" | "date_range" | "number_range" | "text_search";
  target_column: string;
  default_value: string | null;
  sort_order: number;
  config: Record<string, unknown>;
  group_name: string | null;
  created_at: string;
}

/** Well-known keys stored in DashboardFilter.config JSONB */
export interface FilterConfigHints {
  dataset_id?: number;
  column?: string;
  scope?: Record<string, string>;
  delimiter?: string;
  depends_on_filter_id?: number | null;
  sort_values?: boolean;
  is_required?: boolean;
  select_first_by_default?: boolean;
  description?: string;
}

export interface DashboardFilterCreate {
  label: string;
  filter_type?: string;
  target_column: string;
  default_value?: string;
  sort_order?: number;
  config?: Record<string, unknown>;
}

export interface DashboardFilterUpdate {
  label?: string;
  filter_type?: string;
  target_column?: string;
  default_value?: string;
  sort_order?: number;
  config?: Record<string, unknown>;
  group_name?: string | null;
}

// --- Analytics ---

export interface PopularContentItem {
  entity_type: string;
  entity_id: number;
  title: string;
  views_30d: number;
  unique_viewers: number;
  last_viewed: string | null;
}

export interface UserActivityItem {
  user_id: number;
  user_name: string;
  user_email: string;
  total_views: number;
  last_active: string | null;
}

export interface DashboardStats {
  total_views: number;
  unique_viewers: number;
  views_by_day: { day: string; views: number }[];
}

// --- RLS ---

export interface RLSRule {
  id: number;
  connection_id: number;
  table_name: string;
  column_name: string;
  user_id: number | null;
  group_name: string | null;
  filter_value: string;
  created_at: string;
}

export interface RLSRuleCreate {
  connection_id: number;
  table_name: string;
  column_name: string;
  user_id?: number | null;
  group_name?: string | null;
  filter_value: string;
}

// --- Bookmarks ---

export interface Bookmark {
  id: number;
  user_id: number;
  dashboard_id: number;
  name: string;
  filter_state: Record<string, unknown>;
  created_at: string;
}

export interface BookmarkCreate {
  name: string;
  filter_state: Record<string, unknown>;
}

// --- Annotations ---

export interface Annotation {
  id: number;
  chart_id: number | null;
  dashboard_id: number | null;
  user_id: number;
  user_name: string | null;
  annotation_type: "comment" | "reference_line" | "region";
  content: string;
  x_value: string | null;
  y_value: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

export interface AnnotationCreate {
  annotation_type?: string;
  content?: string;
  x_value?: string;
  y_value?: string;
  config?: Record<string, unknown>;
}

// --- Stories ---

export interface Story {
  id: number;
  title: string;
  description: string;
  dashboard_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  slide_count: number;
}

export interface StorySlide {
  id: number;
  story_id: number;
  slide_order: number;
  chart_id: number | null;
  title: string;
  narrative: string;
  filter_state: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface StoryDetail extends Story {
  slides: StorySlide[];
}

export interface StoryCreate {
  title: string;
  description?: string;
  dashboard_id?: number;
}

export interface StorySlideCreate {
  chart_id?: number;
  title?: string;
  narrative?: string;
  filter_state?: Record<string, unknown>;
}

// --- Shared Links ---

export interface SharedLink {
  id: number;
  dashboard_id: number;
  token: string;
  created_by: number | null;
  expires_at: string | null;
  created_at: string;
}

// --- Lineage ---

export interface LineageNode {
  id: string;
  type: "connection" | "chart" | "dashboard" | "dataset" | "report" | "alert";
  name: string;
  meta?: { db_id?: number; slug?: string };
}

export interface LineageEdge {
  source: string;
  target: string;
}

export interface LineageData {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

// --- Change History ---

export interface ChangeHistoryItem {
  id: number;
  entity_type: string;
  entity_id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  created_at: string;
}

// --- SQL Tabs ---

export interface SQLTab {
  id: number;
  user_id: number;
  label: string;
  connection_id: number | null;
  sql_query: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SQLTabCreate {
  label?: string;
  connection_id?: number | null;
}

export interface SQLTabUpdate {
  label?: string;
  connection_id?: number | null;
  sql_query?: string;
  is_active?: boolean;
}

// --- Chart Drafts ---

export interface ChartDraft {
  id: number;
  user_id: number;
  chart_id: number | null;
  dashboard_id: number | null;
  connection_id: number | null;
  dataset_id: number | null;
  title: string;
  description: string;
  mode: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  chart_code: string;
  sql_query: string;
  updated_at: string;
}

export interface ChartDraftUpsert {
  dashboard_id?: number | null;
  connection_id?: number | null;
  dataset_id?: number | null;
  title?: string;
  description?: string;
  mode?: string;
  chart_type?: string;
  chart_config?: Record<string, unknown>;
  chart_code?: string;
  sql_query?: string;
}
