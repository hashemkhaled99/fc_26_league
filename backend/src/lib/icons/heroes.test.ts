import { describe, expect, it } from "vitest";
import { getHeroCatalog, HERO_CATALOG } from "@/lib/icons/heroes";

describe("FC26 Hero catalog", () => {
  it("loads real Heroes (not placeholder Hero — names)", () => {
    const heroes = getHeroCatalog();
    expect(heroes.length).toBeGreaterThanOrEqual(80);
    expect(heroes.every((h) => !h.name.startsWith("Hero —"))).toBe(true);
    expect(heroes.some((h) => h.name === "Eden Hazard")).toBe(true);
    expect(heroes.some((h) => h.name === "Yaya Touré")).toBe(true);
    expect(heroes.some((h) => h.name === "Daniele De Rossi")).toBe(true);
    expect(heroes.some((h) => h.name === "David Ginola")).toBe(true);
  });

  it("has valid positions and ratings", () => {
    const allowed = new Set([
      "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
    ]);
    for (const h of HERO_CATALOG) {
      expect(allowed.has(h.position)).toBe(true);
      expect(h.baseRating).toBeGreaterThanOrEqual(85);
      expect(h.baseRating).toBeLessThanOrEqual(89);
      expect(h.realTeam).toBe("Heroes");
    }
  });
});
