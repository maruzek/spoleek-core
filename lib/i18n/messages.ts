export const messages = {
  en: {
    locale: "en",
    appName: "Spoleek",
  },
  cs: {
    locale: "cs",
    appName: "Spoleek",
  },
} as const;

export type Locale = keyof typeof messages;
