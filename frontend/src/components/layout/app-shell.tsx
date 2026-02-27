"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppHeader } from "./app-header";
import { CommandPalette } from "@/components/command-palette";
import { CopilotSidebar } from "@/components/ai/copilot-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader onAiToggle={() => setCopilotOpen((prev) => !prev)} />
      <main className="flex-1 overflow-auto p-4">
        {children}
      </main>
      <CommandPalette />
      <CopilotSidebar open={copilotOpen} onOpenChange={setCopilotOpen} />
    </div>
  );
}
