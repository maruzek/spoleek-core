import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { type EnvIssue, getServerEnvStatus } from "@/lib/env";

const REQUIRED_KEYS = [
  "APP_URL",
  "DATABASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
  "DEFAULT_LOCALE",
  "WORKSPACE_SYNC_ENABLED",
] as const;

type EnvSetupGuideProps = {
  title?: string;
  description?: string;
};

export function EnvSetupGuide({
  title = "Finish the environment setup before using the app.",
  description = "Spoleek can now stay up even when configuration is incomplete. Use this screen to complete `.env`, then restart the dev server.",
}: EnvSetupGuideProps) {
  const status = getServerEnvStatus();

  return (
    <AppShell eyebrow="Environment setup" title={title} description={description}>
      <section className="grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-4xl border border-amber-900/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
            What to do
          </p>
          <ol className="mt-6 grid gap-3 text-sm leading-7 text-slate-600">
            <li>1. Open `.env` in the project root.</li>
            <li>2. Fill the required variables with real values.</li>
            <li>3. Leave optional values blank if you are not using them yet.</li>
            <li>4. Restart `pnpm dev` after saving the file.</li>
          </ol>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
              Minimum working example
            </p>
            <pre className="mt-4 overflow-x-auto text-xs leading-6 text-slate-700">
{`APP_URL=http://localhost:3000
DATABASE_URL=postgres://admin:password@localhost:5432/spoleek
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-with-at-least-32-characters
APP_ENCRYPTION_KEY=your-encryption-key-with-at-least-32-characters
DEFAULT_LOCALE=en
WORKSPACE_SYNC_ENABLED=false

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SMTP_FROM=`}
            </pre>
          </div>
        </article>

        <article className="grid gap-4 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
            Current validation
          </p>
          {status.issues.length > 0 ? (
            status.issues.map((issue) => <IssueRow key={issue.key} issue={issue} />)
          ) : (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              Environment variables look valid. If the app still fails, restart the dev server once more.
            </div>
          )}

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
              Quick status
            </p>
            <div className="mt-4 grid gap-3">
              {REQUIRED_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <span className="font-medium text-slate-700">{key}</span>
                  <span className="text-slate-500">
                    {describeEnvPresence(status.raw[key])}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button asChild>
              <a href="/setup">Retry setup</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/auth">Open auth</a>
            </Button>
          </div>
        </article>
      </section>
    </AppShell>
  );
}

function IssueRow({ issue }: { issue: EnvIssue }) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4">
      <p className="text-sm font-semibold text-rose-900">{issue.key}</p>
      <p className="mt-1 text-sm text-rose-700">{issue.message}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-rose-500">
        {issue.valueHint}
      </p>
    </div>
  );
}

function describeEnvPresence(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Missing";
  }

  return `Present (${value.trim().length} chars)`;
}
