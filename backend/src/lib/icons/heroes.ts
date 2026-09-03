import fs from "fs";
import path from "path";

export type HeroCatalogEntry = {
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  nation?: string;
};

type HeroFile = {
  players: HeroCatalogEntry[];
};

let cached: HeroCatalogEntry[] | null = null;

/**
 * Real EA FC 26 Ultimate Team Heroes (base cards).
 * Loaded from data/fc26-hero-players.json — same pattern as gold players.
 */
export function getHeroCatalog(): HeroCatalogEntry[] {
  if (cached) return cached;

  const filePath = path.join(process.cwd(), "data", "fc26-hero-players.json");
  if (!fs.existsSync(filePath)) {
    console.warn("[heroes] data/fc26-hero-players.json missing — using empty catalog");
    cached = [];
    return cached;
  }

  const file = JSON.parse(fs.readFileSync(filePath, "utf8")) as HeroFile;
  cached = (file.players ?? []).map((p) => ({
    name: p.name,
    realTeam: p.realTeam || "Heroes",
    position: p.position === "CF" ? "ST" : p.position,
    baseRating: p.baseRating,
    nation: p.nation,
  }));
  return cached;
}

/** Real FC 26 Heroes roster (lazy-loaded from JSON). */
export const HERO_CATALOG: HeroCatalogEntry[] = getHeroCatalog();
