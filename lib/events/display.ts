import type { EventRsvpAnswer, EventStatus, EventVisibility } from "@/server/db/schema";

/**
 * Presentation helpers shared by admin, portal and public event pages. Pure —
 * no server imports — so client components can use them.
 */

export type EventDates = {
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  allDay: boolean;
};

/** "12 Jul 2026, 10:00 – 13 Jul 2026, 18:00", or a date-only range for all-day events. */
export function formatEventWhen(
  event: EventDates,
  locale: string,
  timeZone?: string,
): string | null {
  if (!event.startsAt) return null;

  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const options: Intl.DateTimeFormatOptions = event.allDay
    ? { dateStyle: "medium", timeZone }
    : { dateStyle: "medium", timeStyle: "short", timeZone };
  const format = new Intl.DateTimeFormat(locale, options);

  if (!end) return format.format(start);
  return format.formatRange(start, end);
}

export const eventStatusVariant: Record<EventStatus, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  published: "default",
  cancelled: "destructive",
};

export const eventVisibilityLabel: Record<EventVisibility, string> = {
  public: "Public",
  org: "Whole organization",
  targeted: "Targeted",
};

export const eventAnswerLabel: Record<EventRsvpAnswer, string> = {
  yes: "Going",
  no: "Not going",
  maybe: "Maybe",
};

/** `datetime-local` wants `yyyy-MM-ddTHH:mm` in the browser's zone. */
export function toDateTimeLocal(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
