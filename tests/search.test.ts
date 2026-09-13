import { describe, expect, it } from "vitest";

import { foldForSearch, matchesSearch } from "@/lib/search";

describe("foldForSearch", () => {
  it("strips diacritics and lower-cases", () => {
    expect(foldForSearch("Veřejná událost")).toBe("verejna udalost");
    expect(foldForSearch("Sněm VII")).toBe("snem vii");
  });
});

describe("matchesSearch", () => {
  it("matches accented text from an unaccented query", () => {
    expect(matchesSearch("Veřejná událost", "ver")).toBe(true);
    expect(matchesSearch("Veřejná událost", "udalost")).toBe(true);
  });

  it("matches an accented query too", () => {
    expect(matchesSearch("Veřejná událost", "veř")).toBe(true);
  });

  it("requires every word", () => {
    expect(matchesSearch("Veřejná událost", "verejna praha")).toBe(false);
    expect(matchesSearch("Veřejná událost Praha", "praha udalost")).toBe(true);
  });

  it("treats an empty query as match-all", () => {
    expect(matchesSearch("anything", "   ")).toBe(true);
  });
});
