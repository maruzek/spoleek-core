import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { eventRsvpTokens, events } from "@/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Same shape as invite tokens: sha256 of the raw value, raw value never stored. */
export function hashRsvpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type RsvpTokenHolder =
  | { memberId: string; externalEmail?: null }
  | { memberId?: null; externalEmail: string };

/**
 * Mints an RSVP link for one holder of one event and returns the raw token —
 * the only time it is available. Re-issuing for the same holder replaces the
 * old row, so a resent invite invalidates the earlier link.
 */
export async function issueRsvpToken(
  params: { eventId: string; orgId: string } & RsvpTokenHolder,
  executor: Tx | typeof db = db,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashRsvpToken(raw);
  const now = new Date();

  if (params.memberId) {
    await executor
      .delete(eventRsvpTokens)
      .where(
        and(
          eq(eventRsvpTokens.eventId, params.eventId),
          eq(eventRsvpTokens.memberId, params.memberId),
        ),
      );
  } else {
    await executor
      .delete(eventRsvpTokens)
      .where(
        and(
          eq(eventRsvpTokens.eventId, params.eventId),
          sql`lower(${eventRsvpTokens.externalEmail}) = lower(${params.externalEmail})`,
        ),
      );
  }

  await executor.insert(eventRsvpTokens).values({
    orgId: params.orgId,
    eventId: params.eventId,
    memberId: params.memberId ?? null,
    externalEmail: params.externalEmail ? params.externalEmail.trim().toLowerCase() : null,
    tokenHash,
    issuedAt: now,
  });

  return raw;
}

/**
 * Resolves a raw token to its event and holder, or null. Validity (deadline,
 * status, 90-day fallback) is the caller's job via `isTokenValid` — this only
 * says whether the row exists on a live event.
 */
export async function findTokenHolder(rawToken: string) {
  if (!rawToken || rawToken.length > 128) return null;

  const [row] = await db
    .select({
      token: eventRsvpTokens,
      event: events,
    })
    .from(eventRsvpTokens)
    .innerJoin(events, eq(events.id, eventRsvpTokens.eventId))
    .where(
      and(
        eq(eventRsvpTokens.tokenHash, hashRsvpToken(rawToken)),
        isNull(events.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function touchRsvpToken(tokenId: string, executor: Tx | typeof db = db) {
  await executor
    .update(eventRsvpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(eventRsvpTokens.id, tokenId));
}
