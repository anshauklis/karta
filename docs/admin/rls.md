# Row-Level Security (RLS)

RLS filters data automatically based on the logged-in user, ensuring users only see data they're authorized to view.

## How RLS Works

1. Navigate to **Admin > RLS Rules**
2. Create a rule:
   - **Connection** — which database connection this rule applies to
   - **Filter Clause** — SQL WHERE clause (e.g., `region = 'EU'`)
   - **Users/Roles** — which users or roles this filter applies to
3. When a user runs a query on this connection, the filter clause is automatically injected into the WHERE clause
4. Multiple rules are combined with AND

## Example

| Rule | Filter | Users |
|------|--------|-------|
| EU only | `region = 'EU'` | eu-team role |
| US only | `region = 'US'` | us-team role |
| All data | (no filter) | admin role |

With this configuration:
- Users in the `eu-team` role only see rows where `region = 'EU'`
- Users in the `us-team` role only see rows where `region = 'US'`
- Admins see all data (no filter applied)

## Important Notes

- RLS filters are applied transparently — users see filtered results without knowing filters exist
- Filters are injected at the SQL level, so they work with all chart types
- RLS applies to dashboard views, SQL Lab, and shared links
- Admin users can bypass RLS for debugging by toggling it off
