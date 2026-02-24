"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "./app-header";
import { CommandPalette } from "@/components/command-palette";
import { AiChatDrawer } from "@/components/ai/ai-chat-drawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-blue-600" />
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader onAiToggle={() => setAiDrawerOpen(!aiDrawerOpen)} />
      <main className="flex-1 overflow-auto p-4">
        {children}
      </main>
      <CommandPalette />
      {aiDrawerOpen && <AiChatDrawer onClose={() => setAiDrawerOpen(false)} />}
    </div>
  );
}
