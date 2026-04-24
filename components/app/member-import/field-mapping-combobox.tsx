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
  onChange,
}: {
  columnHeader: string;
  value: FieldTarget | null;
  options: { value: FieldTarget; label: string }[];
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
          {(item: (typeof options)[number]) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
