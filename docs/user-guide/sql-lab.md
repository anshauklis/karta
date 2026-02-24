# SQL Lab

SQL Lab is a full-featured SQL editor for exploring data, testing queries, and exporting results.

## Editor Features

- **Monaco Editor** — the same editor that powers VS Code, with syntax highlighting for SQL
- **Schema Browser** — browse tables and columns in the left panel. Click a table name to insert it into the query.
- **Autocomplete** — SQL keywords, table names, and column names are suggested as you type. Triggered by `.` and space.
- **Multiple Connections** — switch between database connections using the dropdown above the editor

## Running Queries

1. Select a connection from the dropdown
2. Write your SQL query in the editor
3. Click **Run** or press {kbd}`Cmd+Enter` / {kbd}`Ctrl+Enter`
4. Results appear in the table below with:
   - Column headers
   - Sortable columns (click to sort)
   - Row count display
   - Execution time

## Exporting Results

- **CSV** — click the CSV button to download query results
- **Save as Dataset** — save the query for reuse in charts and dashboards

## Tips

- Use `LIMIT` to preview large result sets
- The schema browser refreshes when you switch connections
- Query results are cached for 5 minutes when Redis is enabled
