"use client";

import { createContext, useContext, useMemo } from "react";

import {
  dictionaryFor,
  formatLocaleFor,
  type Dictionary,
  type Locale,
} from "@/lib/i18n/messages";

/**
 * Carries the deployment locale into the client tree.
 *
 * Client bundles cannot read `DEFAULT_LOCALE` — server env vars are not shipped
 * to the browser, and `NEXT_PUBLIC_` vars are inlined at *build* time, which
 * would freeze the locale into the Docker image (`output: "standalone"`) rather
 * than following the container's configuration. So the server resolves it once
 * in the root layout and hands the tag down through context.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** BCP-47 tag for `Intl` in client components. */
export function useFormatLocale(): string {
  return formatLocaleFor(useLocale());
}

/** The dictionary for the active locale, for client components that need copy. */
export function useDictionary(): Dictionary {
  return dictionaryFor(useLocale());
}

export type Formatters = {
  /** "6 Sep 2026, 11:48" — medium date with a short time. */
  formatDateTime: (date: Date | string | null | undefined) => string;
  /** "6 Sep 2026" */
  formatDate: (date: Date | string | null | undefined) => string;
  /** The active `Intl` tag, for one-off formatters. */
  locale: string;
};

/**
 * Locale-aware replacements for the helpers in `lib/format.ts`.
 *
 * Memoized on the locale so the `Intl` objects are built once per tree rather
 * than once per cell — these run inside table renderers over hundreds of rows.
 */
export function useFormatters(): Formatters {
  const locale = useFormatLocale();

  return useMemo(() => {
    const dateTime = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

    return {
      locale,
      formatDateTime: (date) =>
        date ? dateTime.format(new Date(date)) : "Not set",
      formatDate: (date) => (date ? dateOnly.format(new Date(date)) : "Not set"),
    };
  }, [locale]);
}
