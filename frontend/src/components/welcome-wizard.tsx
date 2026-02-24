"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, LayoutDashboard, BarChart3, ArrowRight, X } from "lucide-react";

interface WelcomeWizardProps {
  onDismiss: () => void;
  hasConnections: boolean;
}

export function WelcomeWizard({ onDismiss, hasConnections }: WelcomeWizardProps) {
  const router = useRouter();
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const tconn = useTranslations("connection");
  const tw = useTranslations("wizard");

  const STEPS = [
    {
      icon: Database,
      title: tconn("connectDatabase"),
      desc: tconn("connectDescriptionFull"),
      action: "/connections",
    },
    {
      icon: LayoutDashboard,
      title: tw("createDashboard"),
      desc: tw("createDashboardDesc"),
      action: null,
    },
    {
      icon: BarChart3,
      title: tw("buildCharts"),
      desc: tw("buildChartsDesc"),
      action: null,
    },
  ];

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{ta("welcome")}</h2>
          <p className="text-sm text-muted-foreground">{tw("getStartedSteps")}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDismiss} title={tc("dismiss")}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const done = i === 0 && hasConnections;
          return (
            <Card key={i} className={done ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${done ? "bg-green-100 dark:bg-green-900" : "bg-primary/10"}`}>
                    <step.icon className={`h-5 w-5 ${done ? "text-green-600" : "text-primary"}`} />
                  </div>
                  <CardTitle className="text-sm">{done ? `${step.title}` : `${i + 1}. ${step.title}`}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">{step.desc}</p>
                {!done && step.action && (
                  <Button size="sm" variant="outline" onClick={() => router.push(step.action!)}>
                    {tc("getStarted")}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
