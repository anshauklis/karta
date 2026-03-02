"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { useWhitelabelSettings } from "@/hooks/use-whitelabel";

function WhitelabelInjector() {
  const { data: settings } = useWhitelabelSettings();

  useEffect(() => {
    if (!settings) return;

    if (settings.primary_color) {
      document.documentElement.style.setProperty(
        "--whitelabel-primary",
        settings.primary_color,
      );
    }
    if (settings.accent_color) {
      document.documentElement.style.setProperty(
        "--whitelabel-accent",
        settings.accent_color,
      );
    }
    if (settings.custom_css) {
      // Remove previous custom CSS if any
      const existing = document.getElementById("whitelabel-css");
      if (existing) existing.remove();

      const style = document.createElement("style");
      style.id = "whitelabel-css";
      style.textContent = settings.custom_css;
      document.head.appendChild(style);
      return () => {
        style.remove();
      };
    }
  }, [settings]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <WhitelabelInjector />
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
