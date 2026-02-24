/**
 * Extract table names from a SQL query using regex.
 * Matches identifiers after FROM and JOIN keywords.
 * Supports schema.table notation. Deduplicates results.
 */
export function extractTables(sql: string): string[] {
  if (!sql || !sql.trim()) return [];

  // Remove single-line comments
  let cleaned = sql.replace(/--.*$/gm, "");
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove string literals
  cleaned = cleaned.replace(/'[^']*'/g, "''");

  // Match table names after FROM and JOIN (all variants)
  const pattern = /\b(?:FROM|JOIN)\s+(?!\s*\()([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)?)/gi;

  const tables = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  return [...tables].sort();
}
