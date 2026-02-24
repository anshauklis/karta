"use client";

import ChartEditorPage from "@/app/(dashboard)/dashboard/[slug]/chart/[id]/page";

export default function StandaloneNewChartPage() {
  return <ChartEditorPage params={Promise.resolve({ slug: "", id: "new" })} />;
}
