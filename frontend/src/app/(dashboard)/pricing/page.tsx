"use client";

import { useTranslations } from "next-intl";
import { useBillingStatus, useCheckout } from "@/hooks/use-billing";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";

const TIERS = ["community", "team", "enterpriseTier"] as const;

const TIER_FEATURES: Record<string, string[]> = {
  community: [
    "Up to 5 users",
    "Unlimited dashboards & charts",
    "21+ chart types",
    "SQL Lab",
    "CSV/Parquet upload",
    "Community support",
  ],
  team: [
    "Everything in Community",
    "Unlimited users",
    "Row-Level Security",
    "Scheduled reports",
    "Alerts & notifications",
    "RBAC & teams",
    "Priority support",
  ],
  enterpriseTier: [
    "Everything in Team",
    "SSO / SAML / LDAP",
    "Audit log",
    "Multi-tenancy",
    "White-labeling",
    "Custom integrations",
    "Dedicated support",
    "SLA guarantee",
  ],
};

// Map billing status tier to our tier keys
function tierToKey(tier: string): string {
  if (tier === "enterprise") return "enterpriseTier";
  return tier;
}

export default function PricingPage() {
  const t = useTranslations("billing");
  const { data: billing } = useBillingStatus();
  const checkout = useCheckout();

  const currentTierKey = tierToKey(billing?.tier || "community");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((tierKey) => {
          const isTeam = tierKey === "team";
          const isEnterprise = tierKey === "enterpriseTier";
          const isCurrent = tierKey === currentTierKey;
          const features = TIER_FEATURES[tierKey];

          return (
            <Card
              key={tierKey}
              className={
                isCurrent
                  ? "border-primary shadow-md"
                  : isTeam
                    ? "border-primary/50"
                    : ""
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {t(`${tierKey}.name`)}
                  </CardTitle>
                  {isCurrent && (
                    <Badge variant="secondary" className="text-xs">
                      {t("currentPlan")}
                    </Badge>
                  )}
                  {!isCurrent && isTeam && (
                    <Badge variant="default" className="text-xs">
                      Popular
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {t(`${tierKey}.description`)}
                </CardDescription>
                <p className="mt-2 text-2xl font-bold">
                  {t(`${tierKey}.price`)}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <Badge
                    variant="secondary"
                    className="w-full justify-center py-2"
                  >
                    {t("currentPlan")}
                  </Badge>
                ) : isEnterprise ? (
                  <Button variant="outline" className="w-full" asChild>
                    <a href="mailto:sales@karta.dev">{t("contactSales")}</a>
                  </Button>
                ) : isTeam ? (
                  <Button
                    className="w-full"
                    onClick={() => checkout.mutate("team")}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("upgrade")}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {t("getStarted")}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
