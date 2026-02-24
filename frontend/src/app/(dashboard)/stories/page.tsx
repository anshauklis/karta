"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useStories, useCreateStory, useDeleteStory } from "@/hooks/use-stories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Trash2, Loader2, Presentation, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRoles } from "@/hooks/use-roles";

export default function StoriesPage() {
  const t = useTranslations("story");
  const tc = useTranslations("common");
  const { canEdit } = useRoles();
  const { data: stories, isLoading } = useStories();
  const createStory = useCreateStory();
  const deleteStory = useDeleteStory();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) return;
    const story = await createStory.mutateAsync({ title: title.trim() });
    setTitle("");
    setShowCreate(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48 rounded" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">{t("dataStories")}</h1>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("new")}
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className="border-slate-200">
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Input
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <Button onClick={handleCreate} disabled={createStory.isPending || !title.trim()}>
                {createStory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("create")}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{tc("cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!stories || stories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">{t("noStories")}</h2>
          <p className="mb-4 text-sm text-slate-400">{t("createStoryHint")}</p>
          {canEdit && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("new")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <Card key={story.id} className="group hover:border-blue-200 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{story.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {story.description && (
                  <p className="mb-3 text-sm text-slate-500 line-clamp-2">{story.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {t("slideCount", { count: story.slide_count })}
                  </span>
                  <div className="flex gap-1">
                    <Link href={`/stories/${story.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        <Presentation className="mr-1 h-3 w-3" /> {t("view")}
                      </Button>
                    </Link>
                    <Link href={`/stories/${story.id}/edit`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        <Pencil className="mr-1 h-3 w-3" /> {tc("edit")}
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-400 hover:text-red-600"
                      onClick={() => setDeleteTargetId(story.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteStory.mutate(deleteTargetId!); setDeleteTargetId(null); }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
