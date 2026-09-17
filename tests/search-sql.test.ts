import { describe, expect, it } from "vitest";

import { foldForSearch } from "@/lib/search";
import { ACCENTED, PLAIN, foldSql, matchesAllWordsSql } from "@/server/lib/search-sql";

/**
 * The SQL `translate()` map must agree with `foldForSearch`, or a query that
 * matches in the browser would miss in Postgres (and vice versa).
 */
describe("foldSql", () => {
  it("maps every accented letter to what foldForSearch produces", () => {
    const from = [...ACCENTED];
    const to = [...PLAIN];
    expect(from.length).toBe(to.length);
    for (const [index, char] of from.entries()) {
      expect(foldForSearch(char), `${char} → ${to[index]}`).toBe(
        to[index].toLowerCase(),
      );
    }
  });

  it("covers the Czech alphabet", () => {
    for (const char of "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ") {
      expect(ACCENTED.includes(char), char).toBe(true);
    }
  });
});

describe("matchesAllWordsSql", () => {
  const column = foldSql({ getSQL: () => null as never });

  it("is undefined for a blank query", () => {
    expect(matchesAllWordsSql(column, "  ")).toBeUndefined();
  });

  it("produces one LIKE per word", () => {
    const condition = matchesAllWordsSql(column, "Jan Nová");
    expect(condition).toBeDefined();
    const text = JSON.stringify(condition);
    expect(text).toContain("%jan%");
    expect(text).toContain("%nova%");
  });
});
