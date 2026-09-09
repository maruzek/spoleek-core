import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { type SetupDeploymentTrack } from "@/lib/bootstrap";
import { getServerEnv } from "@/lib/env";
import { schema } from "@/server/db/schema";

const env = getServerEnv();

/**
 * `max` is per Node process, so it cannot be one number for every target.
 * A container is a single long-lived process and wants headroom for the
 * `Promise.all` fan-outs the admin pages do. On Vercel every concurrent
 * instance is its own process with its own pool, so the platform already
 * supplies the concurrency — a large pool there just multiplies idle
 * connections against Neon by the instance count.
 */
const POOL_MAX_BY_DEPLOYMENT_MODE: Record<SetupDeploymentTrack, number> = {
  "local-docker": 10,
  "vps-docker": 10,
  "vercel-neon": 3,
};

const DEFAULT_POOL_MAX = 10;

const globalForDb = globalThis as typeof globalThis & {
  spoleekPool?: Pool;
};

export const pool =
  globalForDb.spoleekPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DEPLOYMENT_MODE
      ? POOL_MAX_BY_DEPLOYMENT_MODE[env.DEPLOYMENT_MODE]
      : DEFAULT_POOL_MAX,
    // pg waits forever by default, so an exhausted pool surfaces as a request
    // that never returns — a hung container, or a serverless invocation that
    // burns to its wall clock with nothing in the log. Fail loudly instead.
    connectionTimeoutMillis: 5_000,
  });

// Cached in every environment, not just development. On a container the module
// evaluates once and this is a no-op; on Vercel more than one bundle can
// evaluate it inside a single instance, and without the cache each one opens
// its own pool against the same database.
globalForDb.spoleekPool = pool;

export const db = drizzle(pool, { schema });
