import { z } from "zod";

// const DEFAULTS = {
//   APP_NAME: "Spoleek",
//   APP_URL: "http://localhost:3000",
//   DATABASE_URL: "postgres://spoleek_admin:password@localhost:5432/spoleek",
//   DEFAULT_LOCALE: "en" as const,
// };

export type RawEnv = ReturnType<typeof getRawServerEnv>;

const optionalUrl = z.preprocess(
  (value) => normalizeOptionalEnv(value),
  z.url().optional(),
);

const optionalString = z.preprocess(
  (value) => normalizeOptionalEnv(value),
  z.string().optional(),
);

const optionalEmail = z.preprocess(
  (value) => normalizeOptionalEnv(value),
  z.email().optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_NAME: z.string(),
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: optionalUrl,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  APP_ENCRYPTION_KEY: z.string().min(32),
  DEFAULT_LOCALE: z.enum(["en", "cs"]),
  SMTP_FROM: optionalEmail,
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: optionalEmail,
  RESEND_WEBHOOK_SECRET: optionalString,
  PURGE_CRON_SECRET: optionalString,
  WORKSPACE_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type EnvIssue = {
  key: string;
  message: string;
  valueHint: string;
};

type ServerEnv = z.infer<typeof serverEnvSchema> & {
  BETTER_AUTH_URL: string;
  isGoogleAuthEnabled: boolean;
};

export const appConfig = {
  name: process.env.APP_NAME,
  defaultLocale: process.env.DEFAULT_LOCALE,
};

let cachedEnv: ServerEnv | null = null;

export function getServerEnvStatus() {
  const raw = getRawServerEnv();
  const parsed = serverEnvSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      isValid: false as const,
      issues: parsed.error.issues.map((issue) => ({
        key: String(issue.path[0] ?? "unknown"),
        message: issue.message,
        valueHint: formatValueHint(
          raw[(issue.path[0] as keyof RawEnv | undefined) ?? "APP_NAME"],
        ),
      })),
      raw,
      isGoogleAuthEnabled: Boolean(
        normalizeOptionalEnv(raw.GOOGLE_CLIENT_ID) &&
        normalizeOptionalEnv(raw.GOOGLE_CLIENT_SECRET),
      ),
    };
  }

  const googleClientId = normalizeOptionalEnv(parsed.data.GOOGLE_CLIENT_ID);
  const googleClientSecret = normalizeOptionalEnv(
    parsed.data.GOOGLE_CLIENT_SECRET,
  );

  const issues: EnvIssue[] = [];

  if (
    (googleClientId && !googleClientSecret) ||
    (!googleClientId && googleClientSecret)
  ) {
    issues.push({
      key: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
      message: "Google sign-in needs both variables or neither.",
      valueHint: "Fill both values or leave both blank.",
    });
  }

  if (issues.length > 0) {
    return {
      isValid: false as const,
      issues,
      raw,
      isGoogleAuthEnabled: false,
    };
  }

  return {
    isValid: true as const,
    issues: [] as EnvIssue[],
    raw,
    isGoogleAuthEnabled: Boolean(googleClientId && googleClientSecret),
    env: {
      ...parsed.data,
      BETTER_AUTH_URL: parsed.data.BETTER_AUTH_URL ?? parsed.data.APP_URL,
      isGoogleAuthEnabled: Boolean(googleClientId && googleClientSecret),
    },
  };
}

export function getServerEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const status = getServerEnvStatus();

  if (!status.isValid) {
    console.error("Invalid environment variables", status.issues);
    throw new Error("Missing or invalid server environment variables.");
  }

  cachedEnv = status.env;
  return cachedEnv;
}

export function getRawServerEnv() {
  return {
    NODE_ENV: process.env.NODE_ENV as
      | "development"
      | "test"
      | "production"
      | undefined,
    APP_NAME: process.env.APP_NAME,
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    DEFAULT_LOCALE: process.env.DEFAULT_LOCALE,
    SMTP_FROM: process.env.SMTP_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    PURGE_CRON_SECRET: process.env.PURGE_CRON_SECRET,
    WORKSPACE_SYNC_ENABLED: process.env.WORKSPACE_SYNC_ENABLED,
  };
}

function normalizeOptionalEnv(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function formatValueHint(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return "Not set";
  }

  return `Present (${value.length} chars)`;
}
