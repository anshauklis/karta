"use client";

import { use } from "react";
import ChartEditorPage from "@/app/(dashboard)/dashboard/[slug]/chart/[id]/page";

export default function StandaloneChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ChartEditorPage params={Promise.resolve({ slug: "", id })} />;
}
