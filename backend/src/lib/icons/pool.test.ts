import { describe, expect, it } from "vitest";
import {
  ALL_TIME_CATALOG,
  ICON_CATALOG,
  ALL_TIME_GOLD_CATALOG,
  parseAllTimePlayer,
  qualityFromRating,
} from "@/lib/icons/pool";

const ALLOWED = new Set([
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
]);

describe("All-time catalog", () => {
  it("has 10,000 unique career-year players", () => {
    expect(ALL_TIME_CATALOG.length).toBe(10_000);
    const names = new Set(ALL_TIME_CATALOG.map((p) => p.name));
    expect(names.size).toBe(10_000);
  });

  it("keeps signature peak seasons", () => {
    expect(ALL_TIME_CATALOG.some((p) => p.name === "Lionel Messi 2009")).toBe(true);
    expect(ALL_TIME_CATALOG.some((p) => p.name === "Lionel Messi 2012")).toBe(true);
    expect(ALL_TIME_CATALOG.some((p) => p.name === "Cristiano Ronaldo 2008")).toBe(true);
    expect(ALL_TIME_CATALOG.some((p) => p.name === "Diego Maradona 1986")).toBe(true);
  });

  it("spreads quality: perfect / good / med / bad / really bad", () => {
    const counts = { perfect: 0, good: 0, med: 0, bad: 0, really_bad: 0 };
    for (const p of ALL_TIME_CATALOG) counts[p.quality] += 1;
    expect(counts.perfect).toBe(280);
    expect(counts.good).toBe(1220);
    expect(counts.med).toBe(4000);
    expect(counts.bad).toBe(3000);
    expect(counts.really_bad).toBe(1500);
    expect(qualityFromRating(96)).toBe("perfect");
    expect(qualityFromRating(84)).toBe("good");
    expect(qualityFromRating(74)).toBe("med");
    expect(qualityFromRating(64)).toBe("bad");
    expect(qualityFromRating(50)).toBe("really_bad");
  });

  it("puts med players in 2000–2026", () => {
    const med = ALL_TIME_CATALOG.filter((p) => p.quality === "med");
    expect(med.length).toBe(4000);
    expect(med.every((p) => p.year != null && p.year >= 2000 && p.year <= 2026)).toBe(true);
  });

  it("assigns icons only to peak seasons", () => {
    expect(ICON_CATALOG.length).toBeGreaterThanOrEqual(250);
    expect(ICON_CATALOG.every((p) => p.baseRating >= 90)).toBe(true);
    expect(ALL_TIME_GOLD_CATALOG.some((p) => p.baseRating < 60)).toBe(true);
  });

  it("has valid positions and unique names in the icon slice", () => {
    const names = new Set<string>();
    for (const p of ICON_CATALOG) {
      expect(names.has(p.name)).toBe(false);
      names.add(p.name);
      expect(ALLOWED.has(p.position)).toBe(true);
      expect(p.realTeam).not.toBe("Icons");
    }
  });

  it("parses display name and year from catalog names", () => {
    expect(parseAllTimePlayer("Lionel Messi 2009", "Barcelona")).toEqual({
      displayName: "Lionel Messi",
      year: 2009,
      club: "Barcelona",
    });
    expect(parseAllTimePlayer("Pelé", "Santos")).toEqual({
      displayName: "Pelé",
      year: null,
      club: "Santos",
    });
  });
});
