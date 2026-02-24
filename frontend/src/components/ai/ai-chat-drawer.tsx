"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Bot, X, Send, Plus, History, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAIChat, useAISessions } from "@/hooks/use-ai";
import { useConnections } from "@/hooks/use-connections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AiChatDrawerProps {
  onClose: () => void;
  context?: { type: string; id: number };
}

export function AiChatDrawer({ onClose, context }: AiChatDrawerProps) {
  const t = useTranslations("aiAssistant");
  const [input, setInput] = useState("");
  const [connectionId, setConnectionId] = useState<number | undefined>();
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    activeToolCall,
    sendMessage,
    loadSession,
    newSession,
  } = useAIChat();

  const { data: sessions } = useAISessions();
  const { data: connections } = useConnections();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text, connectionId, context);
  };

  const handleCopySQL = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(sql);
    toast.success(t("copiedSQL"));
    setTimeout(() => setCopiedSql(null), 2000);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput("");
    sendMessage(prompt, connectionId, context);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("title")}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newSession} title={t("newChat")}>
            <Plus className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("sessions")}>
                <History className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
              {!sessions || sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("noSessions")}</p>
              ) : (
                sessions.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate text-sm">{s.title || `Chat #${s.id}`}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Connection selector */}
      <div className="border-b border-border px-4 py-2">
        <Select
          value={connectionId ? String(connectionId) : ""}
          onValueChange={(v) => setConnectionId(v ? Number(v) : undefined)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={t("selectConnection")} />
          </SelectTrigger>
          <SelectContent>
            {connections?.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name} ({c.db_type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="py-8 text-center">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{t("suggestedPrompts")}</p>
            <div className="space-y-2">
              {(["prompt1", "prompt2", "prompt3"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => handleSuggestedPrompt(t(key))}
                  className="block w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              msg.role === "user"
                ? "ml-8 bg-primary/10 text-foreground"
                : "mr-4 bg-muted text-foreground"
            )}
          >
            {msg.role === "assistant" ? (
              <div className="space-y-2">
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.sql_query && (
                  <div className="rounded border border-border bg-background p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">SQL</span>
                      <button
                        onClick={() => handleCopySQL(msg.sql_query!)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedSql === msg.sql_query ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <pre className="text-xs overflow-x-auto"><code>{msg.sql_query}</code></pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{msg.content}</div>
            )}
          </div>
        ))}

        {/* Streaming content */}
        {isStreaming && (
          <div className="mr-4 rounded-lg bg-muted px-3 py-2 text-sm">
            {activeToolCall ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{t("toolRunning", { tool: activeToolCall })}</span>
              </div>
            ) : streamingContent ? (
              <div className="whitespace-pre-wrap">{streamingContent}</div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{t("thinking")}</span>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            placeholder={t("placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            className="text-sm"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
