"use client";

import * as React from "react";
import { format, isValid, parse, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** What the input shows once a date is committed. Mirrors `formatDate` in `lib/format.ts`. */
const DISPLAY_FORMAT = "MMM d, yyyy";

/** Formats a user may type, tried in order. Keeps ISO and the common EN/CS shapes working. */
const PARSE_FORMATS = [
  DISPLAY_FORMAT,
  "MMMM d, yyyy",
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "M/d/yyyy",
  "dd.MM.yyyy",
  "d.M.yyyy",
];

/** `yyyy-MM-dd` is the wire format: same as `<input type="date">`, timezone-free. */
function toValueString(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/** Accepts `yyyy-MM-dd` and full ISO timestamps (the server normalizes stored dates to ISO). */
function parseValue(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const dateOnly = parse(value, "yyyy-MM-dd", new Date());

  if (isValid(dateOnly)) {
    return dateOnly;
  }

  const parsed = new Date(value);

  return isValid(parsed) ? startOfDay(parsed) : undefined;
}

function parseTyped(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return undefined;
  }

  for (const pattern of PARSE_FORMATS) {
    const parsed = parse(trimmed, pattern, new Date());

    if (isValid(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = DISPLAY_FORMAT,
  disabled,
  required,
  name,
  startMonth,
  endMonth,
  disabledDates,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: {
  id?: string;
  /** `yyyy-MM-dd` (or any ISO string). Empty string / null clears the field. */
  value: string | null | undefined;
  /** Emits `yyyy-MM-dd`, or `""` when the field is cleared. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  startMonth?: Date;
  endMonth?: Date;
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
}) {
  const selected = parseValue(value);
  // `captionLayout="dropdown"` needs a bounded range to build its year list.
  const monthRange = React.useMemo(
    () => ({
      start: startMonth ?? new Date(1900, 0, 1),
      end: endMonth ?? new Date(new Date().getFullYear() + 10, 11, 31),
    }),
    [startMonth, endMonth],
  );
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string | null>(null);

  // While typing we show the raw draft; otherwise the committed value formatted for display.
  const inputValue =
    draft ?? (selected ? format(selected, DISPLAY_FORMAT) : "");

  const commitDraft = () => {
    if (draft === null) {
      return;
    }

    const parsed = parseTyped(draft);

    if (parsed) {
      onChange(toValueString(parsed));
    } else if (!draft.trim()) {
      onChange("");
    }

    setDraft(null);
  };

  return (
    <InputGroup className={className}>
      <InputGroupInput
        id={id}
        name={name}
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete="off"
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={disabled}
              aria-label="Open calendar"
            >
              <CalendarIcon />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              captionLayout="dropdown"
              startMonth={monthRange.start}
              endMonth={monthRange.end}
              disabled={disabledDates}
              onSelect={(date) => {
                setDraft(null);
                onChange(date ? toValueString(date) : "");
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
