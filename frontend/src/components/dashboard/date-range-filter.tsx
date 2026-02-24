"use client";

import { useState, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
} from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

interface DateRangeFilterProps {
  value: { from?: string; to?: string; preset?: string } | null;
  onChange: (val: { from: string; to: string; preset?: string } | null) => void;
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const fmtDisplay = (d: Date) => format(d, "MMM d, yyyy");

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>();
  const clickCountRef = useRef(0);

  const presets = useMemo(() => {
    const today = new Date();
    return [
      { key: "today", label: t("presetToday"), from: today, to: today },
      { key: "yesterday", label: t("presetYesterday"), from: subDays(today, 1), to: subDays(today, 1) },
      { key: "last7", label: t("presetLast7"), from: subDays(today, 6), to: today },
      { key: "last30", label: t("presetLast30"), from: subDays(today, 29), to: today },
      { key: "thisMonth", label: t("presetThisMonth"), from: startOfMonth(today), to: endOfMonth(today) },
      { key: "lastMonth", label: t("presetLastMonth"), from: startOfMonth(subMonths(today, 1)), to: endOfMonth(subMonths(today, 1)) },
      { key: "thisQuarter", label: t("presetThisQuarter"), from: startOfQuarter(today), to: endOfQuarter(today) },
      { key: "thisYear", label: t("presetThisYear"), from: startOfYear(today), to: endOfYear(today) },
    ];
  }, [t]);

  const dateRange: DateRange | undefined = value?.from
    ? { from: new Date(value.from), to: value.to ? new Date(value.to) : undefined }
    : undefined;

  const displayText = value?.preset
    ? presets.find((p) => p.key === value.preset)?.label ?? t("selectDateRange")
    : value?.from
      ? `${fmtDisplay(new Date(value.from))}${value.to ? ` \u2013 ${fmtDisplay(new Date(value.to))}` : ""}`
      : t("selectDateRange");

  const handlePreset = (preset: (typeof presets)[number]) => {
    onChange({ from: fmt(preset.from), to: fmt(preset.to), preset: preset.key });
    clickCountRef.current = 0;
    setPendingRange(undefined);
    setOpen(false);
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      setPendingRange(undefined);
      clickCountRef.current = 0;
      onChange(null);
      return;
    }
    clickCountRef.current += 1;
    if (clickCountRef.current >= 2 && range.from && range.to) {
      setPendingRange(undefined);
      clickCountRef.current = 0;
      onChange({ from: fmt(range.from), to: fmt(range.to) });
      setOpen(false);
    } else {
      setPendingRange(range);
    }
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPendingRange(undefined); clickCountRef.current = 0; } }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 min-w-[180px] justify-start gap-2 bg-white text-sm font-normal shadow-xs"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Presets sidebar */}
          <div className="flex flex-col gap-0.5 border-r p-2 w-[150px]">
            {presets.map((preset) => (
              <Button
                key={preset.key}
                variant={value?.preset === preset.key ? "secondary" : "ghost"}
                size="sm"
                className="justify-start text-xs h-7"
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
            <div className="my-1 border-t" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-xs h-7 text-muted-foreground"
              onClick={handleClear}
            >
              {t("clearDateRange")}
            </Button>
          </div>
          {/* Dual-month calendar */}
          <div className="p-2">
            <Calendar
              mode="range"
              selected={pendingRange ?? dateRange}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              defaultMonth={value?.from ? new Date(value.from) : undefined}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
