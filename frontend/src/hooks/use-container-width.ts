"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Track the width of a container element using ResizeObserver.
 * Returns [ref, width, freeze, unfreeze] — attach ref to the container div.
 * Call freeze() during resize/drag to prevent width updates (avoids
 * scrollbar-induced layout thrashing). Call unfreeze() when done.
 */
export function useContainerWidth(defaultWidth = 1200) {
  const [width, setWidth] = useState(defaultWidth);
  const prevWidth = useRef(defaultWidth);
  const observerRef = useRef<ResizeObserver | null>(null);
  const frozenRef = useRef(false);

  const ref = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      if (frozenRef.current) return;
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0 && Math.abs(w - prevWidth.current) > 10) {
          prevWidth.current = w;
          setWidth(w);
        }
      }
    });

    observer.observe(el);
    observerRef.current = observer;

    const w = el.clientWidth;
    if (w > 0) {
      prevWidth.current = w;
      setWidth(w);
    }
  }, []);

  const freeze = useCallback(() => { frozenRef.current = true; }, []);
  const unfreeze = useCallback(() => { frozenRef.current = false; }, []);

  return [ref, width, freeze, unfreeze] as const;
}
