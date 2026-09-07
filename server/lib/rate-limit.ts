import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, lt, sql } from "drizzle-orm";

import { getServerEnv } from "@/lib/env";
import { db } from "@/server/db";
import { rateLimitBuckets } from "@/server/db/schema";

/**
 * Fixed-window rate limiting for public endpoints, backed by the database.
 *
 * Serverless functions have no shared memory, so an in-process counter resets
 * on every cold start and bounds nothing. A row per window is coarse — a caller
 * can spend a full allowance at the end of one window and again at the start of
 * the next — but the purpose is to make bulk submission tedious, not to shape
 * traffic precisely.
 */
export type RateLimitResult = {
  allowed: boolean;
  /** Remaining attempts in this window, floored at zero. */
  remaining: number;
  retryAfterMs: number;
};

/**
 * Identifies the caller without storing anything that identifies them.
 *
 * The address is salted with `APP_ENCRYPTION_KEY` before hashing, so the table
 * cannot be turned back into a list of visitors by anyone holding a copy of the
 * database alone — which matters because `/join` is reachable by people who
 * have not yet agreed to anything.
 */
function hashIdentifier(scope: string, identifier: string): string {
  const { APP_ENCRYPTION_KEY } = getServerEnv();
  const digest = createHash("sha256")
    .update(`${APP_ENCRYPTION_KEY}:${scope}:${identifier}`)
    .digest("hex");

  return `${scope}:${digest}`;
}

/**
 * Best-effort caller address.
 *
 * Behind Vercel `x-forwarded-for` is set by the platform and the left-most
 * entry is the real client. Self-hosted behind an arbitrary proxy it is
 * spoofable — which is why this limit is one control among several rather than
 * the only thing standing in front of the form.
 */
export async function getRequestIdentifier(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  return headerList.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeRateLimit({
  scope,
  identifier,
  limit,
  windowMs,
  now = new Date(),
}: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<RateLimitResult> {
  const key = hashIdentifier(scope, identifier);
  const expiresAt = new Date(now.getTime() + windowMs);

  // Opportunistic cleanup: the rows are disposable, and this keeps the table
  // from needing a job of its own. Cheap — the index is on `expiresAt`.
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now));

  // One statement so two concurrent requests cannot both read "0 used".
  // A window that has already lapsed is restarted rather than incremented.
  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`case
          when ${rateLimitBuckets.expiresAt} <= ${now} then 1
          else ${rateLimitBuckets.count} + 1
        end`,
        expiresAt: sql`case
          when ${rateLimitBuckets.expiresAt} <= ${now} then ${expiresAt}
          else ${rateLimitBuckets.expiresAt}
        end`,
        updatedAt: now,
      },
    })
    .returning({ count: rateLimitBuckets.count, expiresAt: rateLimitBuckets.expiresAt });

  const count = bucket?.count ?? 1;
  const windowEndsAt = bucket?.expiresAt ?? expiresAt;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterMs: Math.max(0, windowEndsAt.getTime() - now.getTime()),
  };
}

/** Drops a caller's counter — used after a legitimate action succeeds. */
export async function clearRateLimit(scope: string, identifier: string) {
  await db
    .delete(rateLimitBuckets)
    .where(and(eq(rateLimitBuckets.key, hashIdentifier(scope, identifier))));
}
