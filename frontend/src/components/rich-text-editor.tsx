"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { Bold, Italic, Underline, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

const TOOLBAR_BUTTONS = [
  { command: "bold", icon: Bold, label: "Bold" },
  { command: "italic", icon: Italic, label: "Italic" },
  { command: "underline", icon: Underline, label: "Underline" },
] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add description...",
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes into the editor
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCommand = useCallback((command: string) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleLink = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const existingLink = selection.anchorNode?.parentElement?.closest("a");
    if (existingLink) {
      // Remove link
      document.execCommand("unlink", false);
    } else {
      const url = prompt("URL:");
      if (url) {
        // Only allow safe URL schemes
        const trimmed = url.trim();
        if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) {
          return;
        }
        document.execCommand("createLink", false, trimmed);
        // Make link open in new tab
        const links = editorRef.current?.querySelectorAll("a");
        links?.forEach((link) => {
          if (!link.getAttribute("target")) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
          }
        });
      }
    }
    handleInput();
  }, [handleInput]);

  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState("bold")) formats.add("bold");
    if (document.queryCommandState("italic")) formats.add("italic");
    if (document.queryCommandState("underline")) formats.add("underline");
    setActiveFormats(formats);
  }, []);

  return (
    <div className={cn("rounded-md border border-slate-200", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1 py-1">
        {TOOLBAR_BUTTONS.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execCommand(command);
            }}
            title={label}
            className={cn(
              "rounded p-1.5 transition-colors hover:bg-slate-200",
              activeFormats.has(command) && "bg-slate-200 text-blue-600"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleLink();
          }}
          title="Link"
          className="rounded p-1.5 transition-colors hover:bg-slate-200"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        data-placeholder={placeholder}
        className={cn(
          "min-h-[80px] px-3 py-2 text-sm text-slate-700 outline-none",
          "empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]",
          "[&_a]:text-blue-600 [&_a]:underline"
        )}
      />
    </div>
  );
}
