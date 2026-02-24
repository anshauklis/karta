"use client";

import { useEffect } from "react";

/**
 * Register a global keyboard shortcut.
 * Automatically handles Ctrl (Windows/Linux) and Cmd (Mac).
 */
export function useHotkey(
  key: string,
  callback: (e: KeyboardEvent) => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === key.toLowerCase() && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        callback(e);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, callback, enabled]);
}
