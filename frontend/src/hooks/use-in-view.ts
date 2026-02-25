"use client";

import { useRef, useState, useEffect } from "react";

/**
 * Lightweight IntersectionObserver hook for lazy rendering.
 * With `once: true` (default), triggers only on first visibility —
 * once the element has been seen, it stays "in view" forever
 * (avoids re-mounting heavy components like Plotly on scroll).
 */
export function useInView({ rootMargin = "200px", threshold = 0, once = true } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || (once && inView)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once, inView]);

  return [ref, inView] as const;
}
