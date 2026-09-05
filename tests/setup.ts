/**
 * The modules under test sit next to ones that read `lib/env.ts` at import
 * time, and that schema throws on anything missing. None of these tests touch
 * the database or send anything, so the values only have to be well-formed —
 * a pg `Pool` is constructed on import but never connects until a query runs.
 *
 * A real `.env` wins when there is one, so a test that does reach the dev DB
 * behaves the same way the app does.
 */
const FALLBACKS: Record<string, string> = {
  NODE_ENV: "test",
  APP_NAME: "Spoleek",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://spoleek_admin:password@localhost:5432/spoleek",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-chars",
  APP_ENCRYPTION_KEY: "test-encryption-key-at-least-32-chars",
  DEFAULT_LOCALE: "en",
};

try {
  process.loadEnvFile(".env");
} catch {
  // No .env — the fallbacks below are enough for these tests.
}

for (const [key, value] of Object.entries(FALLBACKS)) {
  process.env[key] ??= value;
}
