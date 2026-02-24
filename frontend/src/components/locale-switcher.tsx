"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { locales, type Locale } from "@/i18n/config";

export function LocaleSwitcher({ collapsed }: { collapsed?: boolean }) {
  const locale = useLocale() as Locale;
  const router = useRouter();

  const setLocale = (next: Locale) => {
    if (next === locale) return;
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    router.refresh();
  };

  const isRu = locale === "ru";

  const toggle = (
    <div
      className="relative flex h-8 w-[72px] shrink-0 cursor-pointer items-center rounded-full bg-muted p-0.5"
      role="radiogroup"
      aria-label="Language"
    >
      {/* Animated pill */}
      <div
        className={`absolute h-7 w-[34px] rounded-full bg-primary transition-transform duration-200 ease-in-out ${
          isRu ? "translate-x-[34px]" : "translate-x-0"
        }`}
      />
      {/* EN segment */}
      <button
        type="button"
        role="radio"
        aria-checked={!isRu}
        className={`relative z-10 flex h-7 w-[34px] items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          !isRu ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      {/* RU segment */}
      <button
        type="button"
        role="radio"
        aria-checked={isRu}
        className={`relative z-10 flex h-7 w-[34px] items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          isRu ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => setLocale("ru")}
      >
        RU
      </button>
    </div>
  );

  if (collapsed) {
    return (
      <div className="flex w-full justify-center">
        <Tooltip>
          <TooltipTrigger asChild>{toggle}</TooltipTrigger>
          <TooltipContent side="right">{isRu ? "Русский" : "English"}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return <div className="flex w-full justify-center">{toggle}</div>;
}
