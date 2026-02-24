export const COLOR_PALETTES = [
  { value: "default", label: "Default", colors: ["#636EFA", "#EF553B", "#00CC96", "#AB63FA"] },
  { value: "pastel", label: "Pastel", colors: ["#66C5CC", "#F6CF71", "#F89C74", "#DCB0F2"] },
  { value: "vivid", label: "Vivid", colors: ["#E58606", "#5D69B1", "#52BCA3", "#99C945"] },
  { value: "bold", label: "Bold", colors: ["#7F3C8D", "#11A579", "#3969AC", "#F2B701"] },
  { value: "dark", label: "Dark", colors: ["#2E91E5", "#E15F99", "#1CA71C", "#FB0D0D"] },
  { value: "earth", label: "Earth", colors: ["#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3"] },
];

export const SUPPORTS_STACK = ["bar", "bar_h", "area"];
export const SUPPORTS_SORT = ["bar", "bar_h", "scatter", "line", "funnel", "pareto"];
export const NEEDS_XY = ["bar", "bar_h", "line", "area", "pie", "donut", "scatter", "heatmap", "box", "treemap", "funnel", "waterfall", "combo", "violin", "pareto", "control"];
export const SUPPORTS_COLOR = ["bar", "bar_h", "line", "area", "scatter", "histogram", "heatmap", "box", "treemap", "violin"];
export const SUPPORTS_OVERLAYS = ["line", "bar", "area", "scatter", "combo"];
export const NO_STYLING = ["pivot", "table", "kpi", "correlation"];
