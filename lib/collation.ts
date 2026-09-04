import { z } from "zod";

/**
 * Per-organization sort locale.
 *
 * Ordering member names correctly is locale-dependent: Czech sorts `Š` after
 * all of `S` (Sever < Sokol < Svoboda < Šimek), while English and Swedish fold
 * it into `S` (Sever < Šimek < Sokol < Svoboda). A single instance of this app
 * can host organizations in different countries, so the sort locale is tenant
 * data, not deployment configuration.
 *
 * Ordering happens in Postgres via `ORDER BY ... COLLATE`, using the ICU
 * collations Postgres ships in `pg_collation`. ICU is used rather than libc
 * locales deliberately: libc collations depend on which locales the host OS was
 * built with (an Alpine image, a slim Debian image and a managed provider all
 * differ), whereas the ICU set is compiled into Postgres itself and is
 * identical on every build. Postgres 10+ pre-populates these; every currently
 * supported version, and every managed provider tested, has them.
 *
 * The ICU collation name is derived as `<tag>-x-icu`. Only tags in this list
 * are ever used, and the resolved name is additionally checked against
 * `pg_collation` at runtime — see `server/lib/collation.ts`.
 */
export const SORT_LOCALES = [
  { tag: "und", label: "Default (language-neutral)" },
  { tag: "bg-BG", label: "Bulgarian" },
  { tag: "hr-HR", label: "Croatian" },
  { tag: "cs-CZ", label: "Czech" },
  { tag: "da-DK", label: "Danish" },
  { tag: "nl-NL", label: "Dutch" },
  { tag: "en-GB", label: "English (United Kingdom)" },
  { tag: "en-US", label: "English (United States)" },
  { tag: "et-EE", label: "Estonian" },
  { tag: "fi-FI", label: "Finnish" },
  { tag: "fr-FR", label: "French" },
  { tag: "de-DE", label: "German" },
  { tag: "el-GR", label: "Greek" },
  { tag: "hu-HU", label: "Hungarian" },
  { tag: "it-IT", label: "Italian" },
  { tag: "lv-LV", label: "Latvian" },
  { tag: "lt-LT", label: "Lithuanian" },
  { tag: "nb-NO", label: "Norwegian (Bokmål)" },
  { tag: "pl-PL", label: "Polish" },
  { tag: "pt-PT", label: "Portuguese" },
  { tag: "ro-RO", label: "Romanian" },
  { tag: "ru-RU", label: "Russian" },
  { tag: "sr-Cyrl-RS", label: "Serbian (Cyrillic)" },
  { tag: "sk-SK", label: "Slovak" },
  { tag: "sl-SI", label: "Slovenian" },
  { tag: "es-ES", label: "Spanish" },
  { tag: "sv-SE", label: "Swedish" },
  { tag: "tr-TR", label: "Turkish" },
  { tag: "uk-UA", label: "Ukrainian" },
] as const;

export type SortLocaleTag = (typeof SORT_LOCALES)[number]["tag"];

/** Language-neutral ICU root collation; the fallback on every code path. */
export const DEFAULT_SORT_LOCALE: SortLocaleTag = "und";

const SORT_LOCALE_TAGS = SORT_LOCALES.map((locale) => locale.tag);

export const sortLocaleSchema = z.enum(
  SORT_LOCALE_TAGS as unknown as [SortLocaleTag, ...SortLocaleTag[]],
);

export const organizationLocalizationSettingsSchema = z.object({
  membersSortLocale: sortLocaleSchema,
});

export type OrganizationLocalizationSettings = z.infer<
  typeof organizationLocalizationSettingsSchema
>;

export function isSortLocaleTag(value: unknown): value is SortLocaleTag {
  return typeof value === "string" && SORT_LOCALE_TAGS.includes(value as SortLocaleTag);
}

/**
 * Map a stored tag to its ICU collation name.
 *
 * Anything unrecognised — a value written before a tag was retired, or by a
 * direct database edit — degrades to the root collation rather than throwing.
 */
export function icuCollationName(tag: string): string {
  const safeTag = isSortLocaleTag(tag) ? tag : DEFAULT_SORT_LOCALE;
  return `${safeTag}-x-icu`;
}

export const sortLocaleOptions = SORT_LOCALES.map(({ tag, label }) => ({
  value: tag,
  label,
}));
