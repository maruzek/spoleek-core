import { cs, enGB, enUS, type Locale } from "date-fns/locale";

const LOCALES: Record<string, Locale> = { cs, "cs-CZ": cs, "en-GB": enGB, "en-US": enUS };

/** The date-fns locale for a BCP 47 tag the app formats with; Czech or British English. */
export function dateFnsLocaleFor(tag: string): Locale {
  return LOCALES[tag] ?? (tag.startsWith("cs") ? cs : enGB);
}
