import { sql, type SQL } from "drizzle-orm";

import {
  DEFAULT_SORT_LOCALE,
  icuCollationName,
  isSortLocaleTag,
} from "@/lib/collation";
import { db } from "@/server/db";

const ROOT_COLLATION = icuCollationName(DEFAULT_SORT_LOCALE);

/**
 * Names present in this database's `pg_collation`, resolved once per process.
 *
 * Postgres raises a hard error when `ORDER BY ... COLLATE "x"` names a
 * collation it does not have, which would take the members page down rather
 * than merely mis-sorting it. Every supported Postgres build ships the ICU set,
 * but this app is self-hosted by people we cannot survey, so availability is
 * confirmed rather than assumed.
 */
let availableCollations: Promise<Set<string>> | null = null;

function loadAvailableCollations() {
  availableCollations ??= db
    .execute<{ collname: string }>(
      sql`select collname from pg_collation where collname like '%-x-icu'`,
    )
    .then((result) => {
      const rows = Array.isArray(result) ? result : result.rows;
      return new Set(rows.map((row) => row.collname));
    })
    .catch(() => {
      // A permissions or connectivity failure must not break ordering; fall
      // back to the database's own collation instead.
      availableCollations = null;
      return new Set<string>();
    });

  return availableCollations;
}

/** Test seam — drops the cached lookup so a test can swap databases. */
export function resetCollationCache() {
  availableCollations = null;
}

/**
 * Build the `COLLATE` clause for an organization's sort locale.
 *
 * Returns an empty fragment when the collation is unavailable, so the query
 * still runs (ordering by the database's own collation) on a Postgres without
 * ICU. The name is emitted through `sql.identifier`, and only ever originates
 * from the `SORT_LOCALES` allowlist, so a tampered `members_sort_locale` value
 * cannot inject SQL.
 */
export async function collateFor(tag: string | null | undefined): Promise<SQL> {
  const available = await loadAvailableCollations();

  if (available.size === 0) {
    return sql``;
  }

  const requested = isSortLocaleTag(tag) ? icuCollationName(tag) : ROOT_COLLATION;
  const collation = available.has(requested)
    ? requested
    : available.has(ROOT_COLLATION)
      ? ROOT_COLLATION
      : null;

  return collation ? sql`collate ${sql.identifier(collation)}` : sql``;
}
