import { Skeleton } from "@/components/ui/skeleton";

interface ChartSkeletonProps {
  chartType?: string;
}

export function ChartSkeleton({ chartType }: ChartSkeletonProps) {
  if (chartType === "kpi") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  if (chartType === "table" || chartType === "pivot") {
    return (
      <div className="flex h-full flex-col gap-1.5 p-2">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Skeleton className="aspect-square w-3/5 rounded-full" />
      </div>
    );
  }

  if (chartType === "treemap" || chartType === "funnel") {
    return (
      <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="rounded" />
        ))}
      </div>
    );
  }

  // Default: bar/line/area/combo/scatter/histogram/etc — axis + bars shape
  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex flex-1 items-end gap-1.5 pb-2">
        {[65, 40, 80, 55, 70, 35, 90, 50].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
    </div>
  );
}
