# Alerts & Reports

## Alerts

Set up automated alerts that monitor metrics and notify when thresholds are crossed.

### Creating an Alert

1. Navigate to **Alerts** in the sidebar
2. Click **New Alert**
3. Configure:

| Field | Description |
|-------|-------------|
| **Name** | Descriptive name for the alert |
| **SQL Query** | A query that returns a single numeric value |
| **Connection** | Which database to query |
| **Condition** | Threshold (e.g., "value > 1000") |
| **Schedule** | How often to check (cron expression) |

4. When triggered, alerts create notifications visible in the notification center

### Cron Schedule Examples

| Expression | Schedule |
|------------|----------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |

## Reports

Schedule recurring report generation:

1. Navigate to **Reports** in the sidebar
2. Click **New Report**
3. Configure:

| Field | Description |
|-------|-------------|
| **Dashboard** | Which dashboard to report on |
| **Schedule** | Cron expression for report frequency |
| **Recipients** | Who receives the report |

4. Reports execute all dashboard charts and compile results on the configured schedule
