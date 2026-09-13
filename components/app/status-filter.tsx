"use client";

import { Badge } from "@/components/ui/badge";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";

export type StatusFilterOption<T extends string> = {
  value: T;
  label: string;
  /** Tailwind background class for the dot — see `lib/status-dot.ts`. */
  dotClassName: string;
};

/**
 * Multi-select status filter for any table: overlapping coloured dots for the
 * current selection, a `n/total` count, one row per status in the menu.
 *
 * Pure UI. Where the selection lives (component state, a TanStack column
 * filter, the URL) is the caller's business — `MemberStatusFilter` is the
 * URL-backed wrapper for the members table.
 */
export function StatusFilter<T extends string>({
  options,
  value,
  onChange,
  label = "Status",
  ariaLabel = "Filter by status",
  isPending = false,
  className,
}: {
  options: StatusFilterOption<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  /** Word on the trigger. */
  label?: string;
  ariaLabel?: string;
  /** Marks the trigger while a slower (server-side) refetch is in flight. */
  isPending?: boolean;
  className?: string;
}) {
  return (
    <MultiSelect multiple items={options} value={value} onValueChange={(next) => onChange(next as T[])}>
      <MultiSelectTrigger
        className={cn("min-w-44", className)}
        data-pending={isPending ? "" : undefined}
        aria-label={ariaLabel}
      >
        <MultiSelectValue>
          {(selected: T[]) => (
            <div className="flex min-w-0 items-center gap-2">
              {/* Overlapping dots rather than a list of names: the trigger has
                  to stay one line however many statuses there are, and the
                  colours are already how the Status column reads. */}
              <div className="flex -space-x-1 overflow-hidden">
                {options
                  .filter((option) => selected.includes(option.value))
                  .map((option) => (
                    <span
                      key={option.value}
                      className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-background", option.dotClassName)}
                    />
                  ))}
              </div>
              <span className="truncate">{label}</span>
              <Badge variant="outline" className="ml-0.5">
                {selected.length}/{options.length}
              </Badge>
            </div>
          )}
        </MultiSelectValue>
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectGroup>
          {options.map((option) => (
            <MultiSelectItem key={option.value} value={option.value}>
              <span className={cn("size-2 shrink-0 rounded-full", option.dotClassName)} />
              <span>{option.label}</span>
            </MultiSelectItem>
          ))}
        </MultiSelectGroup>
      </MultiSelectContent>
    </MultiSelect>
  );
}
