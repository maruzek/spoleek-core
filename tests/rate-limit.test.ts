import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";

import { db, pool } from "@/server/db";
import { rateLimitBuckets } from "@/server/db/schema";
import { clearRateLimit, consumeRateLimit } from "@/server/lib/rate-limit";

/**
 * The counter has to live in the database: the app runs as serverless
 * functions, so an in-process counter resets on every cold start and bounds
 * nothing at all.
 *
 * Needs a database. Uses its own scope and deletes those rows afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

const SCOPE = "test-scope";

suite("the rate limiter", () => {
  const identifier = () => `caller-${Math.random().toString(36).slice(2)}`;

  afterAll(async () => {
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, `${SCOPE}:%`));
    await pool.end();
  });

  async function consume(id: string, overrides?: { now?: Date; windowMs?: number }) {
    return consumeRateLimit({
      scope: SCOPE,
      identifier: id,
      limit: 3,
      windowMs: overrides?.windowMs ?? 60_000,
      now: overrides?.now,
    });
  }

  it("allows up to the limit and refuses past it", async () => {
    const id = identifier();

    expect((await consume(id)).allowed).toBe(true);
    expect((await consume(id)).allowed).toBe(true);

    const third = await consume(id);

    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = await consume(id);

    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("counts each caller separately", async () => {
    const noisy = identifier();
    const quiet = identifier();

    await consume(noisy);
    await consume(noisy);
    await consume(noisy);

    expect((await consume(noisy)).allowed).toBe(false);
    expect((await consume(quiet)).allowed).toBe(true);
  });

  it("starts a fresh window once the old one lapses", async () => {
    const id = identifier();
    const start = new Date();

    await consume(id, { now: start });
    await consume(id, { now: start });
    await consume(id, { now: start });

    expect((await consume(id, { now: start })).allowed).toBe(false);

    const later = new Date(start.getTime() + 61_000);

    expect((await consume(id, { now: later })).allowed).toBe(true);
  });

  it("never stores the raw identifier", async () => {
    const id = "203.0.113.42";

    await consume(id);

    const rows = await db
      .select({ key: rateLimitBuckets.key })
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.key, `${SCOPE}:%`));

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !row.key.includes(id))).toBe(true);
  });

  it("clears a caller's counter on request", async () => {
    const id = identifier();

    await consume(id);
    await consume(id);
    await consume(id);

    expect((await consume(id)).allowed).toBe(false);

    await clearRateLimit(SCOPE, id);

    expect((await consume(id)).allowed).toBe(true);
  });
});
