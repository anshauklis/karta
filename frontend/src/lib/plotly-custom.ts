/**
 * Custom Plotly.js bundle — only trace types used by Karta's renderers.
 * Excludes mapbox, WebGL/3D, geo, and other unused modules (~4.4MB → ~1.5MB).
 *
 * If you add a new chart type in api/renderers/, register it here too.
 */

// @ts-expect-error -- plotly.js/lib/core has no TS type declarations
import Plotly from "plotly.js/lib/core";

// Trace types used by api/renderers/
// @ts-expect-error -- plotly.js submodule has no type declarations
import scatter from "plotly.js/lib/scatter";
// @ts-expect-error -- plotly.js submodule has no type declarations
import bar from "plotly.js/lib/bar";
// @ts-expect-error -- plotly.js submodule has no type declarations
import pie from "plotly.js/lib/pie";
// @ts-expect-error -- plotly.js submodule has no type declarations
import heatmap from "plotly.js/lib/heatmap";
// @ts-expect-error -- plotly.js submodule has no type declarations
import histogram from "plotly.js/lib/histogram";
// @ts-expect-error -- plotly.js submodule has no type declarations
import box from "plotly.js/lib/box";
// @ts-expect-error -- plotly.js submodule has no type declarations
import violin from "plotly.js/lib/violin";
// @ts-expect-error -- plotly.js submodule has no type declarations
import treemap from "plotly.js/lib/treemap";
// @ts-expect-error -- plotly.js submodule has no type declarations
import funnel from "plotly.js/lib/funnel";
// @ts-expect-error -- plotly.js submodule has no type declarations
import waterfall from "plotly.js/lib/waterfall";
// @ts-expect-error -- plotly.js submodule has no type declarations
import indicator from "plotly.js/lib/indicator";

Plotly.register([
  scatter,
  bar,
  pie,
  heatmap,
  histogram,
  box,
  violin,
  treemap,
  funnel,
  waterfall,
  indicator,
]);

export default Plotly;
