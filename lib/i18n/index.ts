import { appConfig } from "@/lib/env";
import type { SortLocaleTag } from "@/lib/collation";
import {
  type Dictionary,
  type Locale,
  formatLocaleFor,
  messages,
  sortLocaleFor,
} from "@/lib/i18n/messages";

export type { Dictionary, Locale };
export { formatLocaleFor, sortLocaleFor };

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && value in messages;
}

/**
 * The deployment's locale, from `DEFAULT_LOCALE` in the environment.
 *
 * This is the single base for every locale-dependent behaviour in the app: the
 * public UI language, `Intl` formatting, and the collation a new organization
 * is seeded with. Anything that needs a locale and has no organization in hand
 * resolves to this rather than to a hardcoded "en".
 */
export const defaultLocale: Locale = isSupportedLocale(appConfig.defaultLocale)
  ? appConfig.defaultLocale
  : "en";

/** BCP-47 tag for `Intl` on the server. Client code reads it from context. */
export const defaultFormatLocale: string = formatLocaleFor(defaultLocale);

/** ICU collation tag a new organization starts with. */
export const defaultSortLocale: SortLocaleTag = sortLocaleFor(defaultLocale);

/**
 * Resolves the dictionary for a locale, falling back to the deployment locale.
 *
 * Server-only: `DEFAULT_LOCALE` is not exposed to the browser, so client
 * components receive the locale as a prop (or read it from `LocaleProvider`)
 * rather than calling this. That keeps them ignorant of *how* the locale was
 * chosen, which is what makes a later move to a per-org locale a change in the
 * server pages alone.
 */
export function getDictionary(locale: string = defaultLocale): Dictionary {
  return isSupportedLocale(locale) ? messages[locale] : messages[defaultLocale];
}

/**
 * Normalizes a stored `organizations.locale` value.
 *
 * The column is seeded from `DEFAULT_LOCALE` at setup, but rows created before
 * that (or edited by hand) can hold anything — those fall back to the
 * deployment locale instead of to English.
 */
export function orgLocale(value: string | null | undefined): Locale {
  return isSupportedLocale(value) ? value : defaultLocale;
}

/** `Intl` tag for an organization's stored locale. */
export function orgFormatLocale(value: string | null | undefined): string {
  return formatLocaleFor(orgLocale(value));
}
