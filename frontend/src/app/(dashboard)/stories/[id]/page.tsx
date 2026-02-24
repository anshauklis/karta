"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useStory } from "@/hooks/use-stories";
import { useExecuteChart } from "@/hooks/use-charts";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowRight, ChevronLeft, Pencil } from "lucide-react";
import type { ChartExecuteResult } from "@/types";

export default function StoryViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("story");
  const tc = useTranslations("common");
  const { id } = use(params);
  const storyId = parseInt(id);
  const { data: story, isLoading } = useStory(storyId);
  const executeChart = useExecuteChart();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [results, setResults] = useState<Record<string, ChartExecuteResult>>({});

  const slides = story?.slides || [];
  const slide = slides[currentSlide];

  const slideCacheKey = (chartId: number, filters?: Record<string, unknown>) =>
    `${chartId}:${JSON.stringify(filters ?? {})}`;

  // Execute chart for current slide
  const executeSlideChart = async (chartId: number, filters?: Record<string, unknown>) => {
    const key = slideCacheKey(chartId, filters);
    if (results[key]) return;
    try {
      const result = await executeChart.mutateAsync({ chartId, filters });
      setResults((prev) => ({ ...prev, [key]: result }));
    } catch {
      // ignore
    }
  };

  // Execute on slide change
  const currentKey = slide?.chart_id ? slideCacheKey(slide.chart_id, slide.filter_state) : null;
  if (slide?.chart_id && currentKey && !results[currentKey]) {
    executeSlideChart(slide.chart_id, slide.filter_state);
  }

  if (isLoading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (!story) {
    return <p className="py-20 text-center text-slate-500">{t("notFound")}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/stories">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">{story.title}</h1>
        </div>
        <Link href={`/stories/${storyId}/edit`}>
          <Button size="sm" variant="secondary">
            <Pencil className="mr-1 h-4 w-4" /> {tc("edit")}
          </Button>
        </Link>
      </div>

      {story.description && (
        <p className="text-sm text-slate-500">{story.description}</p>
      )}

      {slides.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-20 text-center">
          <p className="text-slate-400">{t("noSlides")}</p>
        </div>
      ) : (
        <>
          {/* Slide content */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            {slide?.title && (
              <h2 className="mb-4 text-lg font-medium text-slate-800">{slide.title}</h2>
            )}
            {slide?.chart_id && currentKey && results[currentKey]?.figure && (
              <div className="mb-4 h-80">
                <PlotlyChart figure={results[currentKey].figure!} className="h-full w-full" />
              </div>
            )}
            {slide?.narrative && (
              <div className="prose prose-sm max-w-none text-slate-600 whitespace-pre-wrap">
                {slide.narrative}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentSlide((s) => Math.max(0, s - 1))}
              disabled={currentSlide === 0}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("previous")}
            </Button>
            <div className="flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === currentSlide ? "bg-blue-600" : "bg-slate-300"
                  }`}
                />
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => setCurrentSlide((s) => Math.min(slides.length - 1, s + 1))}
              disabled={currentSlide === slides.length - 1}
            >
              {tc("next")} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
