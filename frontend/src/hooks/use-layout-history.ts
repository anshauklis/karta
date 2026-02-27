"use client";

import { useState, useCallback, useRef } from "react";
import type { LayoutItem } from "@/types";

const MAX_HISTORY = 30;

interface LayoutHistory {
  push: (layout: LayoutItem[]) => void;
  undo: () => LayoutItem[] | null;
  redo: () => LayoutItem[] | null;
  canUndo: boolean;
  canRedo: boolean;
  init: (layout: LayoutItem[]) => void;
}

export function useLayoutHistory(): LayoutHistory {
  const [past, setPast] = useState<LayoutItem[][]>([]);
  const [future, setFuture] = useState<LayoutItem[][]>([]);
  const currentRef = useRef<LayoutItem[]>([]);

  const init = useCallback((layout: LayoutItem[]) => {
    currentRef.current = layout;
    setPast([]);
    setFuture([]);
  }, []);

  const push = useCallback((layout: LayoutItem[]) => {
    setPast((prev) => {
      const next = [...prev, currentRef.current];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    currentRef.current = layout;
    setFuture([]);
  }, []);

  const undo = useCallback((): LayoutItem[] | null => {
    let result: LayoutItem[] | null = null;
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const newPast = [...prev];
      const restored = newPast.pop()!;
      setFuture((f) => [...f, currentRef.current]);
      currentRef.current = restored;
      result = restored;
      return newPast;
    });
    return result;
  }, []);

  const redo = useCallback((): LayoutItem[] | null => {
    let result: LayoutItem[] | null = null;
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const newFuture = [...prev];
      const restored = newFuture.pop()!;
      setPast((p) => [...p, currentRef.current]);
      currentRef.current = restored;
      result = restored;
      return newFuture;
    });
    return result;
  }, []);

  return {
    push,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    init,
  };
}
