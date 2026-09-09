"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react";

import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

/**
 * A select that takes more than one value.
 *
 * Deliberately a separate file from `components/ui/select.tsx` rather than an
 * extension of it. That one is Radix, whose `Select` has no multi-value mode at
 * all, and 27 files import it — replacing it wholesale to gain `multiple` would
 * be a rewrite of every select in the app to buy one filter.
 *
 * Base UI is already a dependency (it is what `combobox.tsx` is built on) and
 * its `Select` supports `multiple` natively, including the render-prop `Value`
 * this needs so a trigger can summarise a selection instead of listing it.
 *
 * The styling mirrors `select.tsx` part for part so the two are
 * indistinguishable on screen despite the different primitive underneath.
 */
const MultiSelect = SelectPrimitive.Root;
const MultiSelectGroup = SelectPrimitive.Group;

function MultiSelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      data-slot="multi-select-value"
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      {...props}
    />
  );
}

function MultiSelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="multi-select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

function MultiSelectContent({
  className,
  children,
  sideOffset = 4,
  align = "start",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> & {
  sideOffset?: number;
  align?: "start" | "center" | "end";
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        // Base UI aligns the popup to the selected item by default, which with
        // several items selected has no single sensible answer.
        alignItemWithTrigger={false}
        className="z-50"
      >
        <SelectPrimitive.Popup
          data-slot="multi-select-content"
          className={cn(
            "relative max-h-[min(24rem,var(--available-height))] min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function MultiSelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="multi-select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className="flex min-w-0 items-center gap-2">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
};
