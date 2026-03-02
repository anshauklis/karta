"use client";

export function ColumnPill({
  col, type, chartConfig, setChartConfig, chartType: _chartType,
}: {
  col: string;
  type: "number" | "text" | "date";
  chartConfig: Record<string, unknown>;
  setChartConfig: (cfg: Record<string, unknown>) => void;
  chartType: string;
}) {
  const isX = (chartConfig.x_column as string) === col;
  const isY = ((chartConfig.y_columns as string[]) || []).includes(col);
  const isColor = (chartConfig.color_column as string) === col;

  let badge = "";
  let badgeColor = "";
  if (isX) { badge = "X"; badgeColor = "bg-blue-500"; }
  else if (isY) { badge = "Y"; badgeColor = "bg-green-500"; }
  else if (isColor) { badge = "C"; badgeColor = "bg-purple-500"; }

  const handleClick = () => {
    if (isColor) {
      setChartConfig({ ...chartConfig, color_column: "" });
    } else if (isY) {
      const yCols = ((chartConfig.y_columns as string[]) || []).filter(c => c !== col);
      setChartConfig({ ...chartConfig, y_columns: yCols, color_column: col });
    } else if (isX) {
      const yCols = ((chartConfig.y_columns as string[]) || []);
      setChartConfig({ ...chartConfig, x_column: "", y_columns: [...yCols, col] });
    } else {
      if (!chartConfig.x_column) {
        setChartConfig({ ...chartConfig, x_column: col });
      } else {
        const yCols = ((chartConfig.y_columns as string[]) || []);
        setChartConfig({ ...chartConfig, y_columns: [...yCols, col] });
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors hover:bg-muted ${
        badge ? "bg-muted/50 font-medium" : "text-muted-foreground"
      }`}
      title={`Click to assign ${col} (X → Y → Color → unassign)`}
    >
      {badge && (
        <span className={`${badgeColor} rounded px-1 py-0.5 text-[8px] font-bold text-white leading-none`}>
          {badge}
        </span>
      )}
      <span className="truncate">{col}</span>
      <span className="ml-auto text-[9px] text-muted-foreground/60">
        {type === "number" ? "#" : type === "date" ? "\u{1F4C5}" : "Aa"}
      </span>
    </button>
  );
}
