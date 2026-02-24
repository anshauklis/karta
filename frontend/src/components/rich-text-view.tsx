"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface RichTextViewProps {
  html: string;
  className?: string;
  prose?: boolean;
}

const ALLOWED_TAGS = [
  "b", "strong", "i", "em", "u", "a", "br", "p",
  "h1", "h2", "h3", "ul", "ol", "li",
  "blockquote", "pre", "code", "hr",
];
const ALLOWED_ATTR = ["href", "target", "rel", "class"];

export function RichTextView({ html, className, prose }: RichTextViewProps) {
  const sanitized = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
      }),
    [html]
  );

  if (!html || !html.trim()) return null;

  return (
    <div
      className={cn(
        "text-sm text-slate-600 [&_a]:text-blue-600 [&_a]:underline",
        prose && "tiptap",
        className
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
