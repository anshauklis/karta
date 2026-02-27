# @karta-bi/embed

Embed [Karta](https://github.com/anshauklis/karta) dashboards and charts into any web application.

## Installation

```bash
npm install @karta-bi/embed
```

## Quick Start (React)

```tsx
import { KartaEmbed } from "@karta-bi/embed";

function App() {
  return (
    <KartaEmbed
      baseUrl="https://bi.example.com"
      token="your-share-token"
      theme="dark"
      height={600}
      onReady={(e) => console.log("Loaded:", e.title)}
    />
  );
}
```

## Quick Start (Vanilla JS)

```js
import { createKartaEmbed } from "@karta-bi/embed";

const embed = createKartaEmbed(document.getElementById("dashboard"), {
  baseUrl: "https://bi.example.com",
  token: "your-share-token",
  theme: "dark",
  autoResize: true,
  onReady: (e) => console.log("Loaded:", e.title),
  onChartClick: (e) => console.log("Clicked:", e.chartTitle, e.point),
});

// Update at runtime
embed.setFilters({ region: "EU" });
embed.setTheme("light");
embed.refresh();

// Clean up
embed.destroy();
```

## Props / Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | required | Base URL of your Karta instance |
| `token` | `string` | required | Share token (from Share dialog) |
| `type` | `"dashboard" \| "chart"` | `"dashboard"` | What to embed |
| `theme` | `"light" \| "dark"` | `"light"` | Color theme |
| `filters` | `Record<string, string>` | — | Initial filter values |
| `height` | `number` | `600` | Iframe height in px (ignored with `autoResize`) |
| `autoResize` | `boolean` | `false` | Auto-adjust height to content |
| `className` | `string` | — | CSS class for container (React only) |

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `onReady` | `{ embedType, id, title, chartCount? }` | Embed finished loading |
| `onError` | `{ code, message }` | Load error |
| `onChartClick` | `{ chartId, chartTitle, point? }` | Data point clicked |
| `onFilterChange` | `{ filters }` | Filters applied |
| `onThemeChange` | `{ theme }` | Theme changed |

## Imperative API (React)

```tsx
import { useRef } from "react";
import { KartaEmbed, type KartaEmbedRef } from "@karta-bi/embed";

function App() {
  const ref = useRef<KartaEmbedRef>(null);

  return (
    <>
      <KartaEmbed ref={ref} baseUrl="..." token="..." />
      <button onClick={() => ref.current?.setFilters({ year: "2025" })}>
        Filter 2025
      </button>
      <button onClick={() => ref.current?.refresh()}>Refresh</button>
    </>
  );
}
```

## Embed a Single Chart

```tsx
<KartaEmbed
  baseUrl="https://bi.example.com"
  token="chart-share-token"
  type="chart"
  height={400}
/>
```

## How It Works

The SDK creates an iframe pointing to your Karta instance's embed URL (`/embed/[token]` or `/embed/chart/[token]`). Communication between your app and the iframe uses the browser's `postMessage` API with the `karta:` namespace.

No API keys or credentials are needed — embed tokens are created via Karta's Share dialog and control access.

## License

AGPL-3.0
