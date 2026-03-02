"use client";

import { useTranslations } from "next-intl";
import { useBillingStatus, useBillingPortal, useCheckout } from "@/hooks/use-billing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "trialing":
      return "secondary";
    case "past_due":
      return "destructive";
    case "canceled":
      return "outline";
    default:
      return "secondary";
  }
}

export default function BillingPage() {
  const t = useTranslations("billing");
  const { data: billing, isLoading } = useBillingStatus();
  const portal = useBillingPortal();
  const checkout = useCheckout();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const tier = billing?.tier || "community";
  const status = billing?.status || "active";
  const periodEnd = billing?.period_end;
  const hasSubscription = !!billing?.subscription_id;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("currentPlan")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan row */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("currentPlan")}
              </p>
              <p className="text-lg font-semibold capitalize">{tier}</p>
            </div>
            <Badge variant={statusVariant(status)}>
              {t(`statuses.${status}`)}
            </Badge>
          </div>

          {/* Next billing date */}
          {periodEnd && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("nextBilling")}
                </p>
                <p className="text-base font-medium">
                  {new Date(periodEnd).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {hasSubscription ? (
              <Button
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
              >
                {portal.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("manageSub")}
              </Button>
            ) : (
              <Button
                onClick={() => checkout.mutate("team")}
                disabled={checkout.isPending}
              >
                {checkout.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("upgrade")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
