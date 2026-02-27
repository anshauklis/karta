/** Theme values supported by Karta embed */
export type KartaTheme = "light" | "dark";

/** Type of embedded content */
export type KartaEmbedType = "dashboard" | "chart";

/** Options for creating a Karta embed instance */
export interface KartaEmbedOptions {
  /** Base URL of the Karta instance (e.g. "https://bi.example.com") */
  baseUrl: string;
  /** Share token for the dashboard or chart */
  token: string;
  /** Type of content to embed. Default: "dashboard" */
  type?: KartaEmbedType;
  /** Theme override. Default: "light" */
  theme?: KartaTheme;
  /** Filter values to inject. Keys are column names, values are filter values. */
  filters?: Record<string, string>;
  /** Fixed height in pixels. Ignored if autoResize is true. Default: 600 */
  height?: number;
  /** Automatically resize iframe height to match content. Default: false */
  autoResize?: boolean;
  /** Called when the embed has finished loading */
  onReady?: (event: KartaReadyEvent) => void;
  /** Called when an error occurs during loading */
  onError?: (event: KartaErrorEvent) => void;
  /** Called when a data point on a chart is clicked */
  onChartClick?: (event: KartaChartClickEvent) => void;
  /** Called when filters are applied (confirmation of setFilters) */
  onFilterChange?: (event: KartaFilterChangeEvent) => void;
  /** Called when the theme changes */
  onThemeChange?: (event: KartaThemeChangeEvent) => void;
}

/** Event fired when embed is ready */
export interface KartaReadyEvent {
  embedType: KartaEmbedType;
  id: number;
  title: string;
  chartCount?: number;
}

/** Event fired on load error */
export interface KartaErrorEvent {
  code: string;
  message: string;
}

/** Event fired on chart data point click */
export interface KartaChartClickEvent {
  chartId: number;
  chartTitle: string;
  point?: {
    x?: unknown;
    y?: unknown;
    label?: string;
    name?: string;
  };
}

/** Event fired when filters change */
export interface KartaFilterChangeEvent {
  filters: Record<string, string>;
}

/** Event fired when theme changes */
export interface KartaThemeChangeEvent {
  theme: KartaTheme;
}

/** Imperative methods available on a Karta embed instance */
export interface KartaEmbedInstance {
  /** Update the filters and re-fetch data */
  setFilters(filters: Record<string, string>): void;
  /** Switch the theme */
  setTheme(theme: KartaTheme): void;
  /** Reload the embedded content */
  refresh(): void;
  /** Remove the iframe and clean up event listeners */
  destroy(): void;
}
