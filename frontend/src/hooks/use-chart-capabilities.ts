import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ChartCapabilities {
  needs_x: boolean;
  needs_y: boolean;
  supports_color: boolean;
  supports_stack: boolean;
  supports_sort: boolean;
  supports_overlays: boolean;
  supports_styling: boolean;
  supports_cond_format: boolean;
}

export function useChartCapabilities() {
  return useQuery({
    queryKey: ["chart-capabilities"],
    queryFn: () =>
      api.get<Record<string, ChartCapabilities>>("/api/meta/chart-capabilities"),
    staleTime: Infinity,
  });
}
