"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { feeCurrencyOptions } from "@/lib/membership";
import { cn } from "@/lib/utils";

/**
 * Amount plus currency in one control. The amount is a plain text field — no
 * spinner, no scroll-wheel surprises — that accepts a comma or a dot and
 * settles into a clean number on blur; the currency is a menu on the right.
 */
export function CurrencyInput({
  id,
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  currencies = feeCurrencyOptions,
  placeholder,
  disabled,
  invalid,
  className,
}: {
  id?: string;
  /** Major units; null when empty. */
  amount: number | null;
  currency: string;
  onAmountChange: (amount: number | null) => void;
  onCurrencyChange: (currency: string) => void;
  currencies?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  // Keep what the user is typing ("12," is not a number yet) and only push
  // parsed values up; the prop wins again once it changes from outside.
  const [text, setText] = useState(() => formatAmount(amount));
  const [lastAmount, setLastAmount] = useState(amount);
  if (amount !== lastAmount) {
    setLastAmount(amount);
    if (parseAmount(text) !== amount) setText(formatAmount(amount));
  }

  return (
    <InputGroup className={className}>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="tabular-nums"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          if (!/^\d*[.,]?\d{0,2}$/.test(next)) return;
          setText(next);
          onAmountChange(parseAmount(next));
        }}
        onBlur={() => setText(formatAmount(parseAmount(text)))}
      />
      <InputGroupAddon align="inline-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <InputGroupButton disabled={disabled} className="font-medium tabular-nums text-foreground" aria-label="Currency">
              {currency}
              <ChevronDownIcon />
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-20">
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup value={currency} onValueChange={onCurrencyChange}>
                {currencies.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className={cn("tabular-nums")}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </InputGroupAddon>
    </InputGroup>
  );
}

function parseAmount(text: string): number | null {
  const normalized = text.replace(",", ".");
  if (normalized === "" || normalized === ".") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
