import { convertLayout } from "./keyboard-layouts";

export interface LayoutAwareResult<T> {
  results: T[];
  convertedQuery: string | null;
}

/**
 * Filter items by query, also trying the alternate keyboard layout.
 * Returns merged results + the converted query string if it yielded extra matches.
 */
export function layoutAwareFilter<T>(
  items: T[],
  query: string,
  accessor: (item: T) => string,
): LayoutAwareResult<T> {
  if (!query.trim()) {
    return { results: items, convertedQuery: null };
  }

  const q = query.toLowerCase();
  const directResults = items.filter((item) =>
    accessor(item).toLowerCase().includes(q),
  );

  const converted = convertLayout(query);
  if (!converted) {
    return { results: directResults, convertedQuery: null };
  }

  const cq = converted.toLowerCase();
  const convertedResults = items.filter(
    (item) =>
      accessor(item).toLowerCase().includes(cq) &&
      !accessor(item).toLowerCase().includes(q),
  );

  if (convertedResults.length === 0) {
    return { results: directResults, convertedQuery: null };
  }

  return {
    results: [...directResults, ...convertedResults],
    convertedQuery: converted,
  };
}

/**
 * String-match function for cmdk's filter prop.
 * Returns 1 (match) or 0 (no match).
 */
export function layoutAwareMatch(value: string, search: string): number {
  if (!search.trim()) return 1;
  const s = search.toLowerCase();
  const v = value.toLowerCase();
  if (v.includes(s)) return 1;
  const converted = convertLayout(search);
  if (converted && v.includes(converted.toLowerCase())) return 1;
  return 0;
}
