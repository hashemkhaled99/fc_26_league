import fs from "fs";
import path from "path";
import { nextListingEndsAt } from "@/lib/auction/listings";

export type SeedPlayer = {
  eaId?: string;
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  marketValue: number;
  nation?: string | null;
  league?: string | null;
  gender?: string;
  cardImage?: string | null;
};

type GoldFile = {
  players: SeedPlayer[];
};

let cachedGoldFile: GoldFile | null = null;
let cachedMenPool: SeedPlayer[] | null = null;
let cachedLeagueByKey: Map<string, string | null> | null = null;

function loadGoldFile(): GoldFile {
  if (cachedGoldFile) return cachedGoldFile;

  const filePath = path.join(process.cwd(), "data", "fc26-gold-players.json");
  if (!fs.existsSync(filePath)) {
    cachedGoldFile = { players: [] };
    return cachedGoldFile;
  }
  cachedGoldFile = JSON.parse(fs.readFileSync(filePath, "utf8")) as GoldFile;
  return cachedGoldFile;
}

/**
 * FC26 gold catalog (OVR 75+) from EA ratings API.
 * menOnly defaults to true for friend leagues (smaller, clearer market).
 */
export function getGoldPlayerPool(options?: {
  menOnly?: boolean;
}): SeedPlayer[] {
  const players = loadGoldFile().players ?? [];
  if (players.length === 0) {
    console.warn("[seed] data/fc26-gold-players.json missing — using tiny fallback");
    return FALLBACK_POOL;
  }

  const menOnly = options?.menOnly ?? true;
  if (!menOnly) return players;

  if (!cachedMenPool) {
    cachedMenPool = players.filter((p) => p.gender !== "F");
  }
  return cachedMenPool;
}

/** Cached name|team → league lookup for market responses */
export function getLeagueLookup(): Map<string, string | null> {
  if (cachedLeagueByKey) return cachedLeagueByKey;

  const pool = getGoldPlayerPool({ menOnly: false });
  cachedLeagueByKey = new Map(
    pool.map((p) => [`${p.name.toLowerCase()}|${p.realTeam.toLowerCase()}`, p.league ?? null])
  );
  return cachedLeagueByKey;
}

const FALLBACK_POOL: SeedPlayer[] = [
  { name: "Haaland", realTeam: "Man City", position: "ST", baseRating: 90, marketValue: 95000000 },
  { name: "Mbappé", realTeam: "Real Madrid", position: "ST", baseRating: 91, marketValue: 100000000 },
  { name: "Salah", realTeam: "Liverpool", position: "RW", baseRating: 91, marketValue: 80000000 },
  { name: "Vinicius Jr", realTeam: "Real Madrid", position: "LW", baseRating: 89, marketValue: 85000000 },
  { name: "Bellingham", realTeam: "Real Madrid", position: "CAM", baseRating: 90, marketValue: 75000000 },
  { name: "Rodri", realTeam: "Man City", position: "CDM", baseRating: 90, marketValue: 65000000 },
  { name: "Van Dijk", realTeam: "Liverpool", position: "CB", baseRating: 90, marketValue: 45000000 },
  { name: "Courtois", realTeam: "Real Madrid", position: "GK", baseRating: 89, marketValue: 28000000 },
];

/** Rooms already verified to have a full catalog — skip heavy scan on every market load. */
const catalogReadyRooms = new Set<string>();

export async function seedPlayersForRoom(
  roomId: string,
  options?: { menOnly?: boolean }
): Promise<number> {
  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.player.count({ where: { roomId, isIcon: false } });
  if (existing > 0) return existing;

  const pool = getGoldPlayerPool(options);
  const listingEndsAt = nextListingEndsAt();

  const CHUNK = 200;
  for (let i = 0; i < pool.length; i += CHUNK) {
    const slice = pool.slice(i, i + CHUNK);
    await prisma.player.createMany({
      data: slice.map((p) => ({
        roomId,
        name: p.name,
        realTeam: p.realTeam,
        league: p.league ?? null,
        position: p.position,
        baseRating: p.baseRating,
        marketValue: p.marketValue,
        status: "available",
        listingEndsAt,
        isIcon: false,
      })),
    });
  }

  return pool.length;
}

/** Add any catalog players missing from a room (e.g. after deploying full data file). */
export async function ensureFullCatalog(roomId: string): Promise<number> {
  if (catalogReadyRooms.has(roomId)) return 0;

  const pool = getGoldPlayerPool();
  if (pool.length <= FALLBACK_POOL.length) {
    catalogReadyRooms.add(roomId);
    return 0;
  }

  const { prisma } = await import("@/lib/prisma");

  // Fast path: if the room already has a full-size catalog, skip the name scan.
  const existingCount = await prisma.player.count({
    where: { roomId, isIcon: false, isHero: false },
  });
  if (existingCount >= pool.length) {
    catalogReadyRooms.add(roomId);
    return 0;
  }

  const existing = await prisma.player.findMany({
    where: { roomId, isIcon: false, isHero: false },
    select: { name: true, realTeam: true },
  });

  const existingKeys = new Set(
    existing.map((p) => `${p.name.toLowerCase()}|${p.realTeam.toLowerCase()}`)
  );

  const missing = pool.filter(
    (p) => !existingKeys.has(`${p.name.toLowerCase()}|${p.realTeam.toLowerCase()}`)
  );

  if (missing.length === 0) {
    catalogReadyRooms.add(roomId);
    return 0;
  }

  const listingEndsAt = nextListingEndsAt();
  const CHUNK = 200;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const slice = missing.slice(i, i + CHUNK);
    await prisma.player.createMany({
      data: slice.map((p) => ({
        roomId,
        name: p.name,
        realTeam: p.realTeam,
        league: p.league ?? null,
        position: p.position,
        baseRating: p.baseRating,
        marketValue: p.marketValue,
        status: "available",
        listingEndsAt,
        isIcon: false,
      })),
    });
  }

  catalogReadyRooms.add(roomId);
  return missing.length;
}
