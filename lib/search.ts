/**
 * Case- and accent-insensitive matching for client-side search boxes.
 *
 * "ver" should find "Veřejná událost": Czech members type without diacritics
 * on phones and in a hurry, and the search must not punish that. NFD splits
 * each accented letter into base + combining mark; the range strips the marks.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đłøı]/gi, (char) => STROKE_LETTERS[char] ?? char)
    .toLowerCase();
}

/**
 * Letters with a stroke are single code points, so NFD leaves them alone.
 * Kept in step with the SQL map in `server/lib/search-sql.ts` (tested).
 */
const STROKE_LETTERS: Record<string, string> = {
  đ: "d", Đ: "D",
  ł: "l", Ł: "L",
  ø: "o", Ø: "O",
  ı: "i",
};

/** `true` when every whitespace-separated word of `query` occurs in `haystack`, accents ignored. */
export function matchesSearch(haystack: string, query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const folded = foldForSearch(haystack);
  return words.every((word) => folded.includes(word));
}
