/**
 * D3-style number format presets for chart values.
 * Each preset maps a D3 format specifier to a JS formatting function.
 */

export interface FormatPreset {
  value: string;       // D3 format specifier or key
  label: string;       // Human label
  example: string;     // Example output
  fn: (v: number) => string;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  {
    value: "auto",
    label: "Adaptive formatting",
    example: "12.3K, 0.12",
    fn: (v) => {
      if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
      if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1) + "K";
      if (Number.isInteger(v)) return v.toLocaleString();
      return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    },
  },
  {
    value: ",.1f",
    label: "Number (1 decimal)",
    example: "12,345.4",
    fn: (v) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  },
  {
    value: ",.0f",
    label: "Number (integer)",
    example: "12,345",
    fn: (v) => v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  },
  {
    value: ",.2f",
    label: "Number (2 decimals)",
    example: "12,345.43",
    fn: (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    value: "$,.2f",
    label: "Currency (USD)",
    example: "$1,234.50",
    fn: (v) => "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    value: "€,.2f",
    label: "Currency (EUR)",
    example: "€1,234.50",
    fn: (v) => "€" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    value: "£,.2f",
    label: "Currency (GBP)",
    example: "£1,234.50",
    fn: (v) => "£" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    value: ".1%",
    label: "Percentage (1 decimal)",
    example: "12.3%",
    fn: (v) => (v * 100).toFixed(1) + "%",
  },
  {
    value: ".2%",
    label: "Percentage (2 decimals)",
    example: "12.30%",
    fn: (v) => (v * 100).toFixed(2) + "%",
  },
  {
    value: ".0%",
    label: "Percentage (integer)",
    example: "12%",
    fn: (v) => Math.round(v * 100) + "%",
  },
  {
    value: ".3s",
    label: "SI prefix",
    example: "12.3k, 1.23M",
    fn: (v) => {
      if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(3).replace(/\.?0+$/, "") + "G";
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(3).replace(/\.?0+$/, "") + "M";
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(3).replace(/\.?0+$/, "") + "k";
      return v.toFixed(3).replace(/\.?0+$/, "");
    },
  },
];

/**
 * Format a value using a D3-style format string or preset key.
 */
export function d3Format(value: number, formatStr: string): string {
  const preset = FORMAT_PRESETS.find((p) => p.value === formatStr);
  if (preset) return preset.fn(value);

  // Custom format string — parse basic patterns
  return parseCustomFormat(value, formatStr);
}

function parseCustomFormat(value: number, fmt: string): string {
  if (!fmt) return value.toLocaleString();

  // Detect percentage (multiply by 100)
  const isPct = fmt.includes("%");
  const v = isPct ? value * 100 : value;

  // Detect currency prefix
  let prefix = "";
  const currencyMatch = fmt.match(/^([^,.\d#0]*)/);
  if (currencyMatch && currencyMatch[1]) {
    prefix = currencyMatch[1];
  }

  // Detect decimal places from format like .2f or .0f
  const decMatch = fmt.match(/\.(\d+)[f%s]/);
  const decimals = decMatch ? parseInt(decMatch[1]) : undefined;

  // Detect thousands separator
  const hasThousands = fmt.includes(",");

  let result: string;
  if (decimals !== undefined) {
    result = v.toFixed(decimals);
  } else {
    result = String(v);
  }

  if (hasThousands) {
    const parts = result.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    result = parts.join(".");
  }

  return prefix + result + (isPct ? "%" : "");
}
