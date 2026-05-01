"use client";

import { useMemo } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

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
  const selectedItem = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Combobox
      items={options}
      value={selectedItem}
      onValueChange={(item) => {
        onChange(item ? (item as typeof selectedItem)!.value : null);
      }}
    >
      <ComboboxInput placeholder="Search mappings…" showClear />
      <ComboboxContent>
        <ComboboxEmpty>No match.</ComboboxEmpty>
        <ComboboxList>
          {(item: (typeof options)[number]) => {
            const isUsed =
              usedTargets?.has(item.value) && item.value !== value;
            return (
              <ComboboxItem
                key={item.value}
                value={item}
                disabled={isUsed}
                className={isUsed ? "opacity-50" : undefined}
              >
                {item.label}
                {isUsed && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    already mapped
                  </span>
                )}
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
