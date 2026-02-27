import type {
  KartaEmbedOptions,
  KartaEmbedInstance,
  KartaTheme,
  KartaReadyEvent,
  KartaErrorEvent,
  KartaChartClickEvent,
  KartaFilterChangeEvent,
  KartaThemeChangeEvent,
} from "./types";
import { KARTA_MSG, KARTA_PREFIX } from "./protocol";

/**
 * Create a Karta embed instance. Inserts an iframe into the target element
 * and manages postMessage communication with the embedded content.
 */
export function createKartaEmbed(
  container: HTMLElement,
  options: KartaEmbedOptions,
): KartaEmbedInstance {
  const {
    baseUrl,
    token,
    type = "dashboard",
    theme = "light",
    filters,
    height = 600,
    autoResize = false,
    onReady,
    onError,
    onChartClick,
    onFilterChange,
    onThemeChange,
  } = options;

  // Build iframe URL
  const embedPath = type === "chart" ? `/embed/chart/${token}` : `/embed/${token}`;
  const url = new URL(embedPath, baseUrl);
  url.searchParams.set("theme", theme);
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      url.searchParams.set(`filter_${key}`, val);
    }
  }

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.src = url.toString();
  iframe.style.width = "100%";
  iframe.style.height = autoResize ? "200px" : `${height}px`;
  iframe.style.border = "none";
  iframe.setAttribute("allowfullscreen", "true");
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("title", `Karta ${type} embed`);
  container.appendChild(iframe);

  // Message handler
  function handleMessage(event: MessageEvent) {
    // Only accept messages from our iframe
    if (event.source !== iframe.contentWindow) return;
    const msg = event.data;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith(KARTA_PREFIX)) return;

    switch (msg.type) {
      case KARTA_MSG.READY:
        onReady?.({
          embedType: msg.embedType,
          id: msg.id,
          title: msg.title,
          chartCount: msg.chartCount,
        } as KartaReadyEvent);
        break;

      case KARTA_MSG.ERROR:
        onError?.({
          code: msg.code,
          message: msg.message,
        } as KartaErrorEvent);
        break;

      case KARTA_MSG.RESIZE:
        if (autoResize && typeof msg.height === "number") {
          iframe.style.height = `${msg.height}px`;
        }
        break;

      case KARTA_MSG.CHART_CLICK:
        onChartClick?.({
          chartId: msg.chartId,
          chartTitle: msg.chartTitle,
          point: msg.point,
        } as KartaChartClickEvent);
        break;

      case KARTA_MSG.FILTER_CHANGE:
        onFilterChange?.({
          filters: msg.filters,
        } as KartaFilterChangeEvent);
        break;

      case KARTA_MSG.THEME_CHANGE:
        onThemeChange?.({
          theme: msg.theme,
        } as KartaThemeChangeEvent);
        break;
    }
  }

  window.addEventListener("message", handleMessage);

  // Helper to send command to iframe
  function send(data: Record<string, unknown>) {
    iframe.contentWindow?.postMessage(data, baseUrl);
  }

  // Public API
  const instance: KartaEmbedInstance = {
    setFilters(newFilters: Record<string, string>) {
      send({ type: KARTA_MSG.SET_FILTERS, filters: newFilters });
    },
    setTheme(newTheme: KartaTheme) {
      send({ type: KARTA_MSG.SET_THEME, theme: newTheme });
    },
    refresh() {
      send({ type: KARTA_MSG.REFRESH });
    },
    destroy() {
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    },
  };

  return instance;
}
