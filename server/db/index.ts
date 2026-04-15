import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnv } from "@/lib/env";
import { schema } from "@/server/db/schema";

const env = getServerEnv();

const globalForDb = globalThis as typeof globalThis & {
  spoleekPool?: Pool;
};

export const pool =
  globalForDb.spoleekPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.spoleekPool = pool;
}

export const db = drizzle(pool, { schema });
