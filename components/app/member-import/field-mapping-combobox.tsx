"use client";

import { useState } from "react";
import { ChevronsUpDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { FieldTarget } from "./types";

export function FieldMappingCombobox({
  value,
  options,
  usedTargets,
  onChange,
}: {
  columnHeader: string;
  value: FieldTarget | null;
  options: { value: FieldTarget; label: string }[];
  usedTargets?: Set<FieldTarget>;
  onChange: (v: FieldTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-2 font-normal"
        >
          <span
            className={cn(
              "truncate text-xs",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? selected.label : "— ignore —"}
          </span>
          <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search mappings…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="— ignore —"
                data-checked={value === null}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                — ignore —
              </CommandItem>
              {options.map((item) => {
                const isUsed =
                  usedTargets?.has(item.value) && item.value !== value;
                return (
                  <CommandItem
                    key={item.value}
                    value={item.label}
                    disabled={isUsed}
                    data-checked={item.value === value}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate">{item.label}</span>
                    {isUsed && (
                      <span className="text-[10px] text-muted-foreground">
                        already mapped
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
