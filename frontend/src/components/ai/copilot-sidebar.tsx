"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Plus, History, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { useAIChat, useAISessions } from "@/hooks/use-ai";
import { useConnections } from "@/hooks/use-connections";
import { ChatMessage } from "./chat-message";
import { SuggestedQuestions } from "./suggested-questions";

interface CopilotSidebarProps {
  connectionId?: number;
  context?: { type: string; id: number };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CopilotSidebar({
  connectionId: initialConnectionId,
  context,
  open: controlledOpen,
  onOpenChange,
}: CopilotSidebarProps) {
  const t = useTranslations("copilot");
  const tAi = useTranslations("aiAssistant");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [input, setInput] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use explicitly selected connection, or fall back to initial prop
  const connectionId = selectedConnectionId ?? initialConnectionId;

  // Support both controlled and uncontrolled modes
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const setIsOpen = useCallback((value: boolean) => {
    onOpenChange?.(value);
    setUncontrolledOpen(value);
  }, [onOpenChange]);

  const {
    messages,
    isStreaming,
    streamingContent,
    activeToolCall,
    currentAgent,
    sendMessage,
    loadSession,
    newSession,
  } = useAIChat();

  const { data: sessions } = useAISessions();
  const { data: connections } = useConnections();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text, connectionId, context);
  }, [input, isStreaming, connectionId, context, sendMessage]);

  const handleSuggestedQuestion = useCallback((question: string) => {
    sendMessage(question, connectionId, context);
  }, [connectionId, context, sendMessage]);

  const handleNewSession = useCallback(() => {
    newSession();
  }, [newSession]);

  return (
    <>
      {/* Floating trigger button (FAB) */}
      {!isOpen && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
          onClick={() => setIsOpen(true)}
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      )}

      {/* Sheet sidebar */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          showCloseButton={true}
          className="flex w-[400px] flex-col p-0 gap-0 sm:max-w-[400px]"
        >
          {/* Header */}
          <SheetHeader className="border-b border-border px-4 py-3 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("title")}
            </SheetTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNewSession}
                title={t("newChat")}
              >
                <Plus className="h-4 w-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={tAi("sessions")}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                  {!sessions || sessions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {tAi("noSessions")}
                    </p>
                  ) : (
                    sessions.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        onClick={() => loadSession(s.id)}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate text-sm">
                          {s.title || t("chatFallbackTitle", { id: s.id })}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SheetHeader>

          {/* Connection selector */}
          <div className="border-b border-border px-4 py-2">
            <Select
              value={connectionId ? String(connectionId) : "_none_"}
              onValueChange={(v) => setSelectedConnectionId(v === "_none_" ? undefined : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={tAi("selectConnection")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">{tAi("selectConnection")}</SelectItem>
                {connections?.map((c: { id: number; name: string; db_type: string }) => (
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
              <SuggestedQuestions
                context={context}
                onSelect={handleSuggestedQuestion}
              />
            )}

            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role === "tool" ? "assistant" : msg.role}
                content={msg.content}
                sqlQuery={msg.sql_query}
              />
            ))}

            {/* Streaming content */}
            {isStreaming && (
              <div className="mr-4">
                {currentAgent && (
                  <Badge variant="secondary" className="mb-1 text-[10px] h-4 px-1.5">
                    {currentAgent}
                  </Badge>
                )}
                <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                  {activeToolCall ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{tAi("toolRunning", { tool: activeToolCall })}</span>
                    </div>
                  ) : streamingContent ? (
                    <div className="whitespace-pre-wrap">{streamingContent}</div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{tAi("thinking")}</span>
                    </div>
                  )}
                </div>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
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
        </SheetContent>
      </Sheet>
    </>
  );
}
