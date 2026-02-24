"use client";

import { useState, useCallback } from "react";

interface UndoState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndo<T>(initialState: T) {
  const [state, setState] = useState<UndoState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const set = useCallback((newPresent: T | ((prev: T) => T)) => {
    setState((prev) => {
      const resolved = typeof newPresent === "function"
        ? (newPresent as (prev: T) => T)(prev.present)
        : newPresent;
      if (JSON.stringify(resolved) === JSON.stringify(prev.present)) return prev;
      return {
        past: [...prev.past.slice(-49), prev.present],
        present: resolved,
        future: [],
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    setState({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      return {
        past: prev.past.slice(0, -1),
        present: prev.past[prev.past.length - 1],
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      return {
        past: [...prev.past, prev.present],
        present: prev.future[0],
        future: prev.future.slice(1),
      };
    });
  }, []);

  return {
    value: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
