import { and, sql, type SQL } from "drizzle-orm";

import { foldForSearch } from "@/lib/search";

/**
 * Case- and accent-insensitive `ILIKE` for Postgres, the server-side twin of
 * `foldForSearch` in `lib/search.ts`.
 *
 * Done with `translate()` rather than the `unaccent` extension on purpose: an
 * extension needs `CREATE EXTENSION` rights the app's database role does not
 * have on every managed provider, and the app is built to run the same on all
 * of them (see `lib/collation.ts` for the same reasoning about collations).
 * The map covers the Latin letters with diacritics used by the languages the
 * app ships in and its neighbours; anything outside it still matches on its
 * exact form.
 */
export const ACCENTED = "áàâäãåāăąçćčďđéèêëēėęěğìíîïīįıľĺłńňñóòôöõøōőŕřśšşťţúùûüūůűųýÿźžżÁÀÂÄÃÅĀĂĄÇĆČĎĐÉÈÊËĒĖĘĚĞÌÍÎÏĪĮİĽĹŁŃŇÑÓÒÔÖÕØŌŐŔŘŚŠŞŤŢÚÙÛÜŪŮŰŲÝŸŹŽŻ";
export const PLAIN = "aaaaaaaaacccddeeeeeeeegiiiiiiilllnnnoooooooorrsssttuuuuuuuuyyzzzAAAAAAAAACCCDDEEEEEEEEGIIIIIIILLLNNNOOOOOOOORRSSSTTUUUUUUUUYYZZZ";

export function foldSql(column: SQL | { getSQL(): SQL }): SQL {
  return sql`lower(translate(${column}, ${ACCENTED}, ${PLAIN}))`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * `true` when every whitespace-separated word of `query` occurs somewhere in
 * `haystack`, accents and case ignored — the same rule as `matchesSearch`.
 *
 * Returns `undefined` for an empty query so callers can drop it from `and()`.
 */
export function matchesAllWordsSql(
  haystack: SQL,
  query: string,
): SQL | undefined {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;
  const folded = foldSql(haystack);
  return and(
    ...words.map((word) => sql`${folded} like ${`%${escapeLike(word)}%`}`),
  );
}
