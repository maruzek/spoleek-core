import { getServerEnv } from "@/lib/env";

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Shared shape for the internal cron endpoints: Vercel Cron sends the secret as
 * a bearer token, and a manual `curl` can send it as a header instead.
 */
export function authorizeCronRequest(
  request: Request,
  options?: { secret?: string | null; secretName?: string },
): CronAuthorization {
  const env = getServerEnv();
  const secret =
    options?.secret ??
    env.WORKSPACE_SYNC_CRON_SECRET ??
    process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: `${options?.secretName ?? "WORKSPACE_SYNC_CRON_SECRET"} or CRON_SECRET is not configured.`,
    };
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-spoleek-cron-secret");
  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : headerSecret;

  if (providedSecret !== secret) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }

  return { ok: true };
}
