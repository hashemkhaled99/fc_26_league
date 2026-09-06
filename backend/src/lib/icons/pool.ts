import fs from "fs";
import path from "path";

export type IconCatalogEntry = {
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  year?: number;
  league?: string;
  nation?: string;
};

type LegendFile = {
  players: IconCatalogEntry[];
};

const ALLOWED_POSITIONS = new Set([
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "CF",
]);

function loadAllTimeCatalog(): IconCatalogEntry[] {
  const filePath = path.join(process.cwd(), "data", "all-time-legends.json");
  if (!fs.existsSync(filePath)) {
    console.warn("[icons] data/all-time-legends.json missing — using fallback legends");
    return FALLBACK_LEGENDS;
  }

  const file = JSON.parse(fs.readFileSync(filePath, "utf8")) as LegendFile;
  const seen = new Set<string>();
  const players: IconCatalogEntry[] = [];

  for (const raw of file.players ?? []) {
    const name = String(raw.name ?? "").trim();
    const position = String(raw.position ?? "").trim().toUpperCase();
    const realTeam = String(raw.realTeam ?? "").trim();
    const baseRating = Number(raw.baseRating);
    if (!name || !realTeam) continue;
    if (!ALLOWED_POSITIONS.has(position)) continue;
    if (!Number.isFinite(baseRating) || baseRating < 80 || baseRating > 99) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    players.push({
      name,
      realTeam,
      position: position === "CF" ? "ST" : position,
      baseRating,
      year: raw.year,
      league: raw.league || "All-time",
      nation: raw.nation,
    });
  }

  return players.length > 0 ? players : FALLBACK_LEGENDS;
}

const FALLBACK_LEGENDS: IconCatalogEntry[] = [
  { name: "Lionel Messi 2012", realTeam: "Barcelona", position: "RW", baseRating: 97, year: 2012, league: "La Liga" },
  { name: "Diego Maradona 1986", realTeam: "Argentina", position: "CAM", baseRating: 96, year: 1986, league: "World Cup" },
  { name: "Pelé 1970", realTeam: "Brazil", position: "ST", baseRating: 96, year: 1970, league: "World Cup" },
  { name: "Cristiano Ronaldo 2017", realTeam: "Real Madrid", position: "ST", baseRating: 95, year: 2017, league: "La Liga" },
];

/** All-time career-year legends (Messi 2009, Messi 2012, …) — not FIFA cards. */
export const ICON_CATALOG: IconCatalogEntry[] = loadAllTimeCatalog();

export function iconMarketValue(rating: number) {
  return rating * 1_000_000;
}

/** Split "Lionel Messi 2009" into display name + year for cards. */
export function parseAllTimePlayer(name: string, realTeam?: string) {
  const match = name.trim().match(/^(.*?)\s+(19\d{2}|20\d{2})$/);
  if (!match) {
    return { displayName: name, year: null as number | null, club: realTeam ?? "" };
  }
  return {
    displayName: match[1],
    year: Number(match[2]),
    club: realTeam ?? "",
  };
}
