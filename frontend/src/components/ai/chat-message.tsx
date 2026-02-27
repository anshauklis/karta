"use client";

import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sqlQuery?: string;
  agentName?: string;
}

/**
 * Minimal markdown renderer: handles ```code blocks```, `inline code`,
 * **bold**, *italic*, and bullet lists.
 *
 * Security: HTML entities are escaped FIRST (& < >) before any markdown
 * processing, so user-supplied content cannot inject HTML/scripts.
 */
function renderMarkdown(text: string): string {
  // Escape HTML entities first to prevent XSS
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="rounded border border-border bg-background p-2 text-xs overflow-x-auto my-1"><code>${code.trim()}</code></pre>`;
  });

  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>');

  // Bold: **...**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *...*
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // Bullet lists: lines starting with - or *
  html = html.replace(/^(?:[-*])\s+(.+)/gm, '<li class="ml-4 list-disc">$1</li>');
  // Wrap consecutive <li>s in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-1">$1</ul>');

  // Line breaks (outside of pre blocks)
  html = html.replace(/\n/g, "<br />");
  // Clean up double <br /> inside <pre>
  html = html.replace(/<pre([^>]*)>([\s\S]*?)<\/pre>/g, (_match, attrs, content) => {
    return `<pre${attrs}>${content.replace(/<br \/>/g, "\n")}</pre>`;
  });
  // Clean up <br /> inside <ul>
  html = html.replace(/<ul([^>]*)>([\s\S]*?)<\/ul>/g, (_match, attrs, content) => {
    return `<ul${attrs}>${content.replace(/<br \/>/g, "")}</ul>`;
  });

  return html;
}

export function ChatMessage({ role, content, sqlQuery, agentName }: ChatMessageProps) {
  const [copiedSql, setCopiedSql] = useState(false);

  const renderedContent = useMemo(() => renderMarkdown(content), [content]);

  const handleCopySQL = () => {
    if (!sqlQuery) return;
    navigator.clipboard.writeText(sqlQuery);
    setCopiedSql(true);
    toast.success("SQL copied");
    setTimeout(() => setCopiedSql(false), 2000);
  };

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="ml-12 max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="mr-4">
      {agentName && (
        <Badge variant="secondary" className="mb-1 text-[10px] h-4 px-1.5">
          {agentName}
        </Badge>
      )}
      <div className="rounded-lg bg-muted px-3 py-2 text-sm space-y-2">
        {/* Content is safe: renderMarkdown escapes HTML entities before processing */}
        <div
          className={cn("prose-sm max-w-none", "[&_pre]:my-1 [&_ul]:my-1 [&_li]:ml-4")}
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
        {sqlQuery && (
          <div className="rounded border border-border bg-background p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                SQL
              </span>
              <button
                onClick={handleCopySQL}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedSql ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
            <pre className="text-xs overflow-x-auto">
              <code>{sqlQuery}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
