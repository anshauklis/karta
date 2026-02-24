"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStory, useUpdateStory, useCreateSlide, useUpdateSlide, useDeleteSlide, useReorderSlides } from "@/hooks/use-stories";
import { useAllCharts } from "@/hooks/use-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, Save, Loader2, GripVertical } from "lucide-react";
import type { StorySlide } from "@/types";

function SortableSlide({
  slide,
  idx,
  onUpdate,
  onDelete,
  allCharts,
}: {
  slide: StorySlide;
  idx: number;
  onUpdate: (slideId: number, data: Record<string, unknown>) => void;
  onDelete: (slideId: number) => void;
  allCharts: { id: number; title: string; chart_type: string }[] | undefined;
}) {
  const t = useTranslations("storyEditor");
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: slide.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Card ref={setNodeRef} style={style} className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-slate-300 hover:text-slate-500"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-600">{t("slideNumber", { number: idx + 1 })}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-red-400 hover:text-red-600"
          onClick={() => onDelete(slide.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("slideTitle")}</Label>
          <Input
            className="text-sm"
            value={slide.title}
            onChange={(e) => onUpdate(slide.id, { title: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("chartOptional")}</Label>
          <Select
            value={slide.chart_id?.toString() ?? "none"}
            onValueChange={(val) =>
              onUpdate(slide.id, { chart_id: val !== "none" ? parseInt(val) : undefined })
            }
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={t("selectChart")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("noChart")}</SelectItem>
              {allCharts?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.title || `Chart #${c.id}`} — {c.chart_type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("narrative")}</Label>
        <textarea
          className="w-full rounded-md border border-slate-200 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={3}
          value={slide.narrative}
          onChange={(e) => onUpdate(slide.id, { narrative: e.target.value })}
          placeholder={t("narrativePlaceholder")}
        />
      </div>
    </Card>
  );
}

export default function StoryEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("storyEditor");
  const ts = useTranslations("story");
  const tc = useTranslations("common");
  const { id } = use(params);
  const storyId = parseInt(id);
  const { data: story, isLoading } = useStory(storyId);
  const updateStory = useUpdateStory(storyId);
  const createSlide = useCreateSlide(storyId);
  const updateSlide = useUpdateSlide(storyId);
  const deleteSlide = useDeleteSlide(storyId);
  const reorderSlides = useReorderSlides(storyId);
  const { data: allCharts } = useAllCharts();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [initialized, setInitialized] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (story && !initialized) {
    setTitle(story.title);
    setDescription(story.description);
    setInitialized(true);
  }

  if (isLoading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (!story) {
    return <p className="py-20 text-center text-slate-500">{ts("notFound")}</p>;
  }

  const sortedSlides = [...story.slides].sort((a, b) => a.slide_order - b.slide_order);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedSlides.findIndex((s) => s.id === active.id);
    const newIndex = sortedSlides.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove([...sortedSlides], oldIndex, newIndex);
    reorderSlides.mutate(reordered.map((s, i) => ({ id: s.id, sort_order: i })));
  };

  const handleSave = () => {
    updateStory.mutate({ title, description });
  };

  const handleAddSlide = () => {
    createSlide.mutate({ title: "", narrative: "" });
  };

  const handleUpdateSlide = (slideId: number, data: Record<string, unknown>) => {
    updateSlide.mutate({ slideId, data });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/stories">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">{t("editStory")}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/stories/${storyId}`}>
            <Button size="sm" variant="secondary">{t("preview")}</Button>
          </Link>
          <Button size="sm" onClick={handleSave} disabled={updateStory.isPending}>
            {updateStory.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {tc("save")}
          </Button>
        </div>
      </div>

      {/* Story metadata */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{t("title")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("description")}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} />
        </div>
      </div>

      {/* Slides */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("slides")}</Label>
          <Button size="sm" onClick={handleAddSlide} disabled={createSlide.isPending}>
            {createSlide.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            {t("addSlide")}
          </Button>
        </div>

        {sortedSlides.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">{t("noSlides")}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedSlides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sortedSlides.map((slide, idx) => (
                <SortableSlide
                  key={slide.id}
                  slide={slide}
                  idx={idx}
                  onUpdate={handleUpdateSlide}
                  onDelete={(slideId) => deleteSlide.mutate(slideId)}
                  allCharts={allCharts}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
