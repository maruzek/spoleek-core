"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, Clock2Icon, XIcon } from "lucide-react";

import { useFormatters } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFnsLocaleFor } from "@/lib/date-fns-locale";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

/** "9:05", "09:05", "9.05", "0905", "9" → [9, 5]; anything else → null. */
function parseTime(raw: string): [number, number] | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.h]?(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return [h, min];
}

/**
 * A date (from the shadcn Calendar, in the org's locale) and, unless the
 * field is date-only, a time. The trigger shows the date the way the rest of
 * the app prints it — "5. 11. 2026" in Czech — instead of the browser's
 * `mm/dd/yyyy` guess, so there is no format to work out before typing.
 */
export function DateTimeField({
  id,
  value,
  onChange,
  dateOnly = false,
  placeholder,
  disabled,
  "aria-invalid": ariaInvalid,
  className,
}: {
  id?: string;
  value: Date | null | undefined;
  onChange: (value: Date | null) => void;
  /** Hide the time input; the date keeps its current time (midnight for a new one). */
  dateOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  className?: string;
}) {
  const { locale } = useFormatters();
  const dfLocale = useMemo(() => dateFnsLocaleFor(locale), [locale]);
  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "numeric", year: "numeric" }),
    [locale],
  );
  const [open, setOpen] = useState(false);
  // Raw text while the time is being typed; null shows the committed value.
  const [timeDraft, setTimeDraft] = useState<string | null>(null);

  const date = value ? new Date(value) : null;
  const timeValue = timeDraft ?? (date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "");

  const pickDate = (picked: Date | undefined) => {
    if (!picked) {
      onChange(null);
      return;
    }
    const next = new Date(picked);
    // Keep the time already chosen; a fresh field starts at midnight.
    if (date) next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    onChange(next);
    setOpen(false);
  };

  const commitTime = () => {
    if (timeDraft === null) return;
    const parsed = parseTime(timeDraft);
    setTimeDraft(null);
    if (!parsed) return;
    const next = date ? new Date(date) : new Date();
    next.setHours(parsed[0], parsed[1], 0, 0);
    onChange(next);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={cn("min-w-44 justify-start font-normal", !date && "text-muted-foreground")}
          >
            <CalendarIcon data-icon="inline-start" />
            {date ? dateLabel.format(date) : (placeholder ?? "Pick a date")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={dfLocale}
            selected={date ?? undefined}
            defaultMonth={date ?? undefined}
            captionLayout="dropdown"
            startMonth={new Date(new Date().getFullYear() - 1, 0, 1)}
            endMonth={new Date(new Date().getFullYear() + 5, 11, 31)}
            onSelect={pickDate}
          />
        </PopoverContent>
      </Popover>

      {date ? (
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Clear date" disabled={disabled} onClick={() => onChange(null)}>
          <XIcon />
        </Button>
      ) : null}

      {dateOnly ? null : (
        <InputGroup className="w-28">
          {/* A text field, not `type="time"`: the browser renders that one in
              the OS clock format (12-hour on many machines) whatever the page
              locale says. This always reads and accepts 24-hour HH:mm. */}
          <InputGroupInput
            aria-label="Time (24-hour)"
            inputMode="numeric"
            placeholder="HH:mm"
            autoComplete="off"
            disabled={disabled}
            value={timeValue}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={commitTime}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTime();
              }
            }}
            className="tabular-nums"
          />
          <InputGroupAddon>
            <Clock2Icon className="text-muted-foreground" />
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  );
}
