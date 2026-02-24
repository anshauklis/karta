"use client";

import { HexColorPicker, HexColorInput } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  title?: string;
}

export function ColorPicker({ value, onChange, className = "h-6 w-6", title }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`cursor-pointer rounded border border-border shrink-0 ${className}`}
          style={{ backgroundColor: value }}
          title={title}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col gap-2">
          <HexColorPicker color={value} onChange={onChange} style={{ width: "200px", height: "160px" }} />
          <HexColorInput color={value} onChange={onChange} prefixed className="h-7 rounded border border-border px-2 text-xs font-mono" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
