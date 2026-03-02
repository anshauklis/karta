"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  BarChart3,
  Database,
  Terminal,
  FileSpreadsheet,
  Bell,
  FileText,
  BookOpen,
  Search,
  Menu,
  Users,
  Shield,
  Eye,
  GitBranch,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Bot,
  Layers,
  Puzzle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { useRouter } from "next/navigation";
import { useRoles } from "@/hooks/use-roles";

const PRIMARY_NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "dashboards" },
  { href: "/charts", icon: BarChart3, labelKey: "charts" },
  { href: "/sql-lab", icon: Terminal, labelKey: "sqlLab" },
  { href: "/connections", icon: Database, labelKey: "connections" },
  { href: "/datasets", icon: FileSpreadsheet, labelKey: "datasets" },
  { href: "/metrics", icon: Layers, labelKey: "metrics" },
] as const;

const MORE_NAV_ITEMS = [
  { href: "/alerts", icon: Bell, labelKey: "alerts" },
  { href: "/reports", icon: FileText, labelKey: "reports" },
  { href: "/stories", icon: BookOpen, labelKey: "stories" },
] as const;


const ADMIN_ITEMS = [
  { href: "/admin/users", icon: Users, labelKey: "users" },
  { href: "/admin/rls", icon: Shield, labelKey: "rlsRules" },
  { href: "/admin/plugins", icon: Puzzle, labelKey: "plugins" },
  { href: "/admin/ai", icon: Bot, labelKey: "ai" },
  { href: "/analytics", icon: Eye, labelKey: "analytics" },
  { href: "/lineage", icon: GitBranch, labelKey: "lineage" },
] as const;

interface AppHeaderProps {
  onAiToggle?: () => void;
}

export function AppHeader({ onAiToggle }: AppHeaderProps) {
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const { isAdmin, canSqlLab } = useRoles();
  const userName = session?.user?.name || "";
  const userEmail = session?.user?.email || "";
  const userInitial = (userName || userEmail || "U").charAt(0).toUpperCase();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  const setLocale = (next: Locale) => {
    if (next === locale) return;
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-4">
      {/* Mobile hamburger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 h-8 w-8 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 gap-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Karta
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto px-2 py-2">
            {PRIMARY_NAV_ITEMS
              .filter(({ href }) => href !== "/sql-lab" || canSqlLab)
              .map(({ href, icon: Icon, labelKey }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tn(labelKey)}
              </Link>
            ))}

            <Separator className="my-2" />
            <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {tn("more")}
            </p>
            {MORE_NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tn(labelKey)}
              </Link>
            ))}
          </nav>

          <div className="mt-auto border-t border-border px-2 py-2">
            <button
              onClick={() => setTheme(nextTheme)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <ThemeIcon className="h-4 w-4" />
              Theme: {themeLabel}
            </button>
            <button
              onClick={() => setLocale(locale === "ru" ? "en" : "ru")}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="text-sm">🌐</span>
              Language: {locale === "ru" ? "Русский" : "English"}
            </button>
            <Separator className="my-2" />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {tc("signOut")}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Logo */}
      <Link href="/" className="mr-6 flex items-center gap-2 shrink-0">
        <BarChart3 className="h-5 w-5 text-blue-600" />
        <span className="text-sm font-semibold hidden lg:inline">Karta</span>
      </Link>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-1">
        {PRIMARY_NAV_ITEMS
          .filter(({ href }) => href !== "/sql-lab" || canSqlLab)
          .map(({ href, icon: Icon, labelKey }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {tn(labelKey)}
          </Link>
        ))}

        {/* More dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                MORE_NAV_ITEMS.some(({ href }) => isActive(href))
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tn("more")}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {MORE_NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {tn(labelKey)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* AI Assistant button */}
        {onAiToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onAiToggle}
            title={tn("aiAssistant")}
          >
            <Bot className="h-4 w-4" />
          </Button>
        )}

        {/* Search button */}
        <button
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              })
            )
          }
          className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>

        {/* Settings dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="User menu"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
            >
              {userInitial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* User identity */}
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{userName || userEmail}</p>
              {userName && userEmail && (
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              )}
            </div>
            <DropdownMenuSeparator />

            {/* Admin section — only for admins */}
            {isAdmin && (
              <>
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {tn("admin")}
                </DropdownMenuLabel>
                {ADMIN_ITEMS.map(({ href, icon: Icon, labelKey }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {tn(labelKey)}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}

            {/* Preferences */}
            <DropdownMenuItem onClick={() => setTheme(nextTheme)}>
              <ThemeIcon className="h-4 w-4" />
              Theme: {themeLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setLocale(locale === "ru" ? "en" : "ru");
              }}
            >
              <span className="text-sm">🌐</span>
              Language: {locale === "ru" ? "Русский" : "English"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            {/* Sign out */}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              {tc("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
