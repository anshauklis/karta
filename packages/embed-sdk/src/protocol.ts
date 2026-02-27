/** All postMessage types used by the Karta embed protocol */
export const KARTA_MSG = {
  // Commands (parent -> iframe)
  SET_THEME: "karta:setTheme",
  SET_FILTERS: "karta:setFilters",
  REFRESH: "karta:refresh",
  // Events (iframe -> parent)
  READY: "karta:ready",
  ERROR: "karta:error",
  RESIZE: "karta:resize",
  CHART_CLICK: "karta:chartClick",
  FILTER_CHANGE: "karta:filterChange",
  THEME_CHANGE: "karta:themeChange",
} as const;

/** Prefix for all Karta postMessage types */
export const KARTA_PREFIX = "karta:";
