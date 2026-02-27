"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { useState, useCallback } from "react";

// --- Types ---

export interface AISession {
  id: number;
  title: string;
  context_type: string | null;
  context_id: number | null;
  connection_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown[];
  sql_query?: string;
  created_at: string;
}

export interface AIGlossaryTerm {
  id: number;
  term: string;
  definition: string;
  sql_hint: string | null;
  created_by: number | null;
  created_at: string;
}

export interface AIStreamEvent {
  type: "session" | "text" | "sql" | "data" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  session_id?: number;
  name?: string;
  status?: string;
  columns?: string[];
  rows?: unknown[][];
}

// --- Session hooks ---

export function useAISessions() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["ai-sessions"],
    queryFn: () => api.get<AISession[]>("/api/ai/sessions", token),
    enabled: !!token,
  });
}

export function useAISessionMessages(sessionId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["ai-session", sessionId],
    queryFn: () => api.get<AIMessage[]>(`/api/ai/sessions/${sessionId}`, token),
    enabled: !!token && !!sessionId,
  });
}

export function useDeleteAISession() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.delete(`/api/ai/sessions/${sessionId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-sessions"] });
    },
  });
}

// --- Chat streaming hook ---

export function useAIChat() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string, connectionId?: number, context?: { type: string; id: number }) => {
      if (!token || isStreaming) return;

      const userMsg: AIMessage = {
        id: Date.now(),
        session_id: currentSessionId || 0,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent("");

      try {
        let assistantContent = "";
        let assistantSql: string | undefined;
        let sessionId = currentSessionId;

        const stream = api.stream<AIStreamEvent>("/api/ai/chat", {
          session_id: currentSessionId,
          message: text,
          connection_id: connectionId,
          context,
        }, token);

        for await (const event of stream) {
          switch (event.type) {
            case "session":
              sessionId = event.session_id!;
              setCurrentSessionId(sessionId);
              break;
            case "text":
              assistantContent += event.content || "";
              setStreamingContent(assistantContent);
              break;
            case "sql":
              assistantSql = event.content;
              break;
            case "tool_call":
              setActiveToolCall(event.name || null);
              break;
            case "tool_result":
              setActiveToolCall(null);
              break;
            case "error":
              assistantContent += `\n\nError: ${event.content}`;
              setStreamingContent(assistantContent);
              break;
            case "done":
              break;
          }
        }

        const assistantMsg: AIMessage = {
          id: Date.now() + 1,
          session_id: sessionId || 0,
          role: "assistant",
          content: assistantContent,
          sql_query: assistantSql,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent("");
        queryClient.invalidateQueries({ queryKey: ["ai-sessions"] });
      } catch (err) {
        const errorMsg: AIMessage = {
          id: Date.now() + 1,
          session_id: currentSessionId || 0,
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setStreamingContent("");
      } finally {
        setIsStreaming(false);
        setActiveToolCall(null);
      }
    },
    [token, isStreaming, currentSessionId, queryClient],
  );

  const loadSession = useCallback(
    async (sessionId: number) => {
      if (!token) return;
      const msgs = await api.get<AIMessage[]>(`/api/ai/sessions/${sessionId}`, token);
      setMessages(msgs);
      setCurrentSessionId(sessionId);
    },
    [token],
  );

  const newSession = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(null);
    setStreamingContent("");
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    activeToolCall,
    currentSessionId,
    sendMessage,
    loadSession,
    newSession,
  };
}

// --- One-shot hooks ---

export function useGenerateSQL() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useMutation({
    mutationFn: (data: { connection_id: number; prompt: string; current_sql?: string }) =>
      api.post<{ text: string; sql: string | null }>("/api/ai/generate-sql", data, token),
  });
}

export function useFixSQL() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useMutation({
    mutationFn: (data: { connection_id: number; sql: string; error: string }) =>
      api.post<{ text: string; sql: string | null }>("/api/ai/fix-sql", data, token),
  });
}

export function useSummarizeChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useMutation({
    mutationFn: (data: {
      chart_type?: string;
      title?: string;
      columns?: string[];
      rows?: unknown[];
      row_count?: number;
    }) => api.post<{ text: string }>("/api/ai/summarize", data, token),
  });
}

// --- Suggest chart config hook ---

export interface SuggestChartConfigParams {
  prompt: string;
  connection_id?: number;
  dataset_id?: number;
  columns: string[];
  current_config?: Record<string, unknown>;
  current_chart_type?: string;
}

export interface SuggestChartConfigResult {
  chart_type: string;
  chart_config: Record<string, unknown>;
  sql_query?: string;
  title?: string;
  explanation?: string;
}

export function useSuggestChartConfig() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useMutation({
    mutationFn: (params: SuggestChartConfigParams) =>
      api.post<SuggestChartConfigResult>("/api/ai/suggest-chart-config", params, token),
  });
}

// --- Parse dashboard filters (NL → structured) ---

export function useParseDashboardFilters() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useMutation({
    mutationFn: (params: {
      prompt: string;
      columns: { name: string; type: string }[];
    }) =>
      api.post<{ filters: Array<{ column: string; value: unknown }> }>(
        "/api/ai/parse-filters",
        params,
        token,
      ),
  });
}

// --- Glossary hooks ---

export function useAIGlossary() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["ai-glossary"],
    queryFn: () => api.get<AIGlossaryTerm[]>("/api/ai/glossary", token),
    enabled: !!token,
  });
}

export function useCreateGlossaryTerm() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { term: string; definition: string; sql_hint?: string }) =>
      api.post<AIGlossaryTerm>("/api/ai/glossary", data, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-glossary"] }),
  });
}

export function useUpdateGlossaryTerm() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; term?: string; definition?: string; sql_hint?: string }) =>
      api.put<AIGlossaryTerm>(`/api/ai/glossary/${id}`, data, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-glossary"] }),
  });
}

export function useDeleteGlossaryTerm() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/ai/glossary/${id}`, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-glossary"] }),
  });
}
