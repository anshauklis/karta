"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  ScrollText,
  Users,
  Palette,
  Building2,
  Headset,
  Check,
  ArrowRight,
} from "lucide-react";

const featureIcons = [ShieldCheck, ScrollText, Users, Palette, Building2, Headset];
const featureKeys = [
  "sso",
  "auditLog",
  "rbac",
  "whiteLabel",
  "multiTenant",
  "prioritySupport",
] as const;

const tiers = ["community", "team", "enterprise"] as const;

const tierFeatureCounts = {
  community: 5,
  team: 8,
  enterprise: 11,
} as const;

export default function EnterprisePage() {
  const t = useTranslations("enterprise");

  return (
    <div className="mx-auto max-w-6xl space-y-16 pb-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 py-16 text-center sm:px-12 sm:py-20">
        <div className="relative z-10 mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground/80">
            {t("description")}
          </p>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="space-y-8">
        <h2 className="text-center text-2xl font-semibold">
          {t("features.title")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureKeys.map((key, i) => {
            const Icon = featureIcons[i];
            return (
              <Card
                key={key}
                className="group transition-colors hover:border-primary/30"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">
                      {t(`features.${key}.name`)}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    {t(`features.${key}.description`)}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="space-y-8">
        <h2 className="text-center text-2xl font-semibold">
          {t("pricing.title")}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => {
            const isRecommended = tier === "team";
            return (
              <Card
                key={tier}
                className={`relative flex flex-col ${
                  isRecommended
                    ? "border-primary shadow-md"
                    : ""
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>{t("pricing.recommended")}</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t(`pricing.${tier}.name`)}
                  </CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">
                      {t(`pricing.${tier}.price`)}
                    </span>
                    {tier === "team" && (
                      <span className="ml-1 text-sm text-muted-foreground">
                        {t("pricing.perUserMonth")}
                      </span>
                    )}
                  </div>
                  <CardDescription className="mt-2">
                    {t(`pricing.${tier}.description`)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex-1 space-y-2">
                    {Array.from({ length: tierFeatureCounts[tier] }).map(
                      (_, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{t(`pricing.${tier}.features.${i}`)}</span>
                        </li>
                      )
                    )}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-muted/50 px-6 py-12 text-center sm:px-12">
        <h2 className="text-2xl font-semibold">{t("cta.title")}</h2>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
          {t("cta.description")}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild>
            <a href="mailto:sales@karta.dev">
              {t("cta.contactSales")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/setup">{t("cta.getStarted")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
