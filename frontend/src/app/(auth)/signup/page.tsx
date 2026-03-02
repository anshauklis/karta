"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3 } from "lucide-react";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export default function SignupPage() {
  const t = useTranslations("cloud");
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setSlug(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${API_URL}/api/cloud/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName,
          slug,
          admin_email: adminEmail,
          admin_name: adminName,
          admin_password: adminPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 409) {
          setError(t("slugTaken"));
        } else {
          setError(data?.detail || `Error ${res.status}`);
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      setSuccess(true);

      // Redirect to the new workspace after a short delay
      setTimeout(() => {
        window.location.href = data.url;
      }, 2000);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl font-semibold">{t("title")}</CardTitle>
        <CardDescription>
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("signIn")}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success ? (
          <p className="text-sm text-emerald-600 text-center py-4">
            {t("success")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">{t("orgName")}</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => handleOrgNameChange(e.target.value)}
                required
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">{t("slug")}</Label>
              <div className="flex items-center gap-0">
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  required
                  className="rounded-r-none"
                  placeholder="acme"
                />
                <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 h-9 text-sm text-muted-foreground whitespace-nowrap">
                  .karta.app
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">{t("adminEmail")}</Label>
              <Input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
                placeholder="admin@acme.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminName">{t("adminName")}</Label>
              <Input
                id="adminName"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">{t("adminPassword")}</Label>
              <Input
                id="adminPassword"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("creating") : t("createAccount")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
