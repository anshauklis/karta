import { useState, useCallback, useRef, useEffect } from "react";

export function useRowSelection(resetKey?: unknown) {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const anchorRef = useRef<number | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedRows(new Set());
      anchorRef.current = null;
    });
  }, [resetKey]);

  const handleRowClick = useCallback(
    (index: number, event: React.MouseEvent) => {
      if (event.shiftKey) event.preventDefault();
      setSelectedRows((prev) => {
        const next = new Set(prev);

        if (event.shiftKey && anchorRef.current !== null) {
          // Shift+click: select range from anchor to current
          const start = Math.min(anchorRef.current, index);
          const end = Math.max(anchorRef.current, index);
          // Clear previous selection unless Ctrl is also held
          if (!event.ctrlKey && !event.metaKey) {
            next.clear();
          }
          for (let i = start; i <= end; i++) {
            next.add(i);
          }
        } else if (event.ctrlKey || event.metaKey) {
          // Ctrl/Cmd+click: toggle single row
          if (next.has(index)) {
            next.delete(index);
          } else {
            next.add(index);
          }
          anchorRef.current = index;
        } else {
          // Plain click: select only this row (toggle if already selected)
          if (next.size === 1 && next.has(index)) {
            next.clear();
            anchorRef.current = null;
          } else {
            next.clear();
            next.add(index);
            anchorRef.current = index;
          }
        }

        return next;
      });
    },
    [],
  );

  const isSelected = useCallback(
    (index: number) => selectedRows.has(index),
    [selectedRows],
  );

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    anchorRef.current = null;
  }, []);

  return { selectedRows, handleRowClick, isSelected, clearSelection };
}
