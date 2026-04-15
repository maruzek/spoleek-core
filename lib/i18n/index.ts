import { appConfig } from "@/lib/env";
import { type Locale, messages } from "@/lib/i18n/messages";

export function getDictionary(locale: string = appConfig.defaultLocale || "en") {
  return messages[locale as Locale] || messages["en"];
}
