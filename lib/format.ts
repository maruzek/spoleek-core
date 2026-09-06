import { defaultFormatLocale } from "@/lib/i18n";

/**
 * Server-side date formatting.
 *
 * Client components must use `useFormatters()` from
 * `components/locale-provider` instead: this module resolves the deployment
 * locale through `lib/env`, which the browser cannot read.
 */
export function formatDateTime(
  date: Date | string | null | undefined,
  locale: string = defaultFormatLocale,
) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDate(
  date: Date | string | null | undefined,
  locale: string = defaultFormatLocale,
) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(date));
}

/**
 * "6 September 2026" — the long form used in payment and renewal emails.
 *
 * These used to be pinned to "en-GB" at four separate call sites, so a Czech
 * deployment sent Czech copy with English dates in it.
 */
export function formatLongDate(
  date: Date | string,
  locale: string = defaultFormatLocale,
) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}
