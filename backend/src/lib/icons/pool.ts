import fs from "fs";
import path from "path";

export type AllTimeQuality = "perfect" | "good" | "med" | "bad" | "really_bad";

export type AllTimePlayer = {
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  year?: number;
  league?: string;
  nation?: string;
  quality: AllTimeQuality;
};

type AllTimeFile = {
  players: Array<Partial<AllTimePlayer> & { name?: string }>;
};

const ALLOWED_POSITIONS = new Set([
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "CF",
]);

export function qualityFromRating(rating: number): AllTimeQuality {
  if (rating >= 90) return "perfect";
  if (rating >= 80) return "good";
  if (rating >= 70) return "med";
  if (rating >= 60) return "bad";
  return "really_bad";
}

export function qualityLabel(quality: AllTimeQuality | string): string {
  switch (quality) {
    case "perfect":
      return "Perfect";
    case "good":
      return "Good";
    case "med":
      return "Med";
    case "bad":
      return "Bad";
    case "really_bad":
      return "Really bad";
    default:
      return "Med";
  }
}

export function allTimeMarketValue(rating: number) {
  if (rating >= 90) return rating * 1_000_000;
  if (rating >= 80) return 12_000_000 + (rating - 80) * 3_500_000;
  if (rating >= 70) return 3_000_000 + (rating - 70) * 800_000;
  if (rating >= 60) return 800_000 + (rating - 60) * 200_000;
  return 150_000 + Math.max(0, rating - 45) * 40_000;
}

const FALLBACK: AllTimePlayer[] = [
  { name: "Lionel Messi 2012", realTeam: "Barcelona", position: "RW", baseRating: 97, year: 2012, league: "La Liga", quality: "perfect" },
  { name: "Diego Maradona 1986", realTeam: "Argentina", position: "CAM", baseRating: 96, year: 1986, league: "World Cup", quality: "perfect" },
];

function loadAllTimeFile(): AllTimePlayer[] {
  const full = path.join(process.cwd(), "data", "all-time-players.json");
  const legends = path.join(process.cwd(), "data", "all-time-legends.json");
  const filePath = fs.existsSync(full) ? full : legends;
  if (!fs.existsSync(filePath)) {
    console.warn("[all-time] catalog missing — using fallback");
    return FALLBACK;
  }

  const file = JSON.parse(fs.readFileSync(filePath, "utf8")) as AllTimeFile;
  const seen = new Set<string>();
  const players: AllTimePlayer[] = [];

  for (const raw of file.players ?? []) {
    const name = String(raw.name ?? "").trim();
    const position = String(raw.position ?? "").trim().toUpperCase();
    const realTeam = String(raw.realTeam ?? "").trim();
    const baseRating = Number(raw.baseRating);
    if (!name || !realTeam) continue;
    if (!ALLOWED_POSITIONS.has(position)) continue;
    if (!Number.isFinite(baseRating) || baseRating < 40 || baseRating > 99) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const quality = (raw.quality as AllTimeQuality) || qualityFromRating(baseRating);
    players.push({
      name,
      realTeam,
      position: position === "CF" ? "ST" : position,
      baseRating,
      year: raw.year,
      league: raw.league || "All-time",
      nation: raw.nation,
      quality,
    });
  }

  return players.length > 0 ? players : FALLBACK;
}

/** Full all-time pool (~10k) across perfect / good / med / bad / really bad. */
export const ALL_TIME_CATALOG: AllTimePlayer[] = loadAllTimeFile();

/** Peak seasons (90+). */
export const ICON_CATALOG: AllTimePlayer[] = ALL_TIME_CATALOG.filter(
  (p) => p.quality === "perfect" || p.baseRating >= 90
);

/** Strong all-time seasons that sit in Hero range. */
export const ALL_TIME_HERO_CATALOG: AllTimePlayer[] = ALL_TIME_CATALOG.filter(
  (p) => p.quality === "good" && p.baseRating >= 85 && p.baseRating < 90
);

/** Med / bad / really bad + lower good seasons. */
export const ALL_TIME_GOLD_CATALOG: AllTimePlayer[] = ALL_TIME_CATALOG.filter(
  (p) => p.baseRating < 85
);

export function iconMarketValue(rating: number) {
  return allTimeMarketValue(rating);
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

export function tierForAllTimeRating(rating: number): "GOLD" | "HERO" | "ICON" {
  if (rating >= 90) return "ICON";
  if (rating >= 85) return "HERO";
  return "GOLD";
}
