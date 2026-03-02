"use client"

import * as React from "react"
import { X, ChevronsUpDown, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selectedLabels = selected.map((val) => {
    const opt = options.find((o) => o.value === val)
    return opt ? opt.label : val
  })

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(selected.filter((v) => v !== value))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls="multi-select-list"
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex min-h-9 w-full items-center justify-between rounded-md border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <div className="flex flex-wrap gap-1">
            {selected.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {selectedLabels.map((label, i) => (
              <Badge
                key={selected[i]}
                variant="secondary"
                className="rounded-sm px-1.5 py-0 text-xs font-normal"
              >
                {label}
                <button
                  type="button"
                  className="ring-offset-background focus:ring-ring ml-1 rounded-full outline-none focus:ring-2 focus:ring-offset-1"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => handleRemove(selected[i], e)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList id="multi-select-list">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleToggle(option.value)}
                >
                  <div
                    className={cn(
                      "border-primary mr-2 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      selected.includes(option.value)
                        ? "bg-primary text-primary-foreground"
                        : "opacity-50"
                    )}
                  >
                    {selected.includes(option.value) && (
                      <Check className="size-3" />
                    )}
                  </div>
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
