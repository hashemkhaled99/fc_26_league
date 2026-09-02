import { prisma } from "@/lib/prisma";

/** Single round-robin: each pair plays once. */
export function buildRoundRobinPairs(userIds: string[]): Array<[string, string]> {
  const ids = [...userIds];
  if (ids.length < 2) return [];

  // Circle method — odd count adds a bye (null skipped)
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push("__BYE__");

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...ids];
  const pairs: Array<[string, string]> = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home === "__BYE__" || away === "__BYE__") continue;
      // Alternate home/away by round for fairness
      if (r % 2 === 0) pairs.push([home, away]);
      else pairs.push([away, home]);
    }
    // rotate all but first
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return pairs;
}

export async function generateFixtures(
  roomId: string,
  season: number,
  doubleRound = false,
  participantUserIds?: string[]
) {
  const existing = await prisma.match.count({ where: { roomId, season } });
  if (existing > 0) throw new Error("Fixtures already exist for this season");

  const users = await prisma.user.findMany({
    where: {
      roomId,
      ...(participantUserIds && participantUserIds.length > 0
        ? { id: { in: participantUserIds } }
        : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (users.length < 2) throw new Error("Need at least 2 clubs to start a league");

  let pairs = buildRoundRobinPairs(users.map((u) => u.id));
  if (doubleRound) {
    const reverse = pairs.map(([h, a]) => [a, h] as [string, string]);
    pairs = [...pairs, ...reverse];
  }

  await prisma.match.createMany({
    data: pairs.map(([homeUserId, awayUserId]) => ({
      roomId,
      season,
      homeUserId,
      awayUserId,
      status: "scheduled",
    })),
  });

  return { matches: pairs.length, clubs: users.length };
}

export interface StandingRow {
  userId: string;
  teamName: string;
  displayName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  currentStreak: number;
  currentStreakType: string | null;
  onFire: boolean;
}

export async function computeStandings(roomId: string, season: number): Promise<StandingRow[]> {
  const users = await prisma.user.findMany({
    where: { roomId },
    select: {
      id: true,
      teamName: true,
      displayName: true,
      currentStreak: true,
      currentStreakType: true,
    },
  });

  const matches = await prisma.match.findMany({
    where: { roomId, season, status: "confirmed" },
  });

  const table = new Map<string, StandingRow>();
  for (const u of users) {
    table.set(u.id, {
      userId: u.id,
      teamName: u.teamName,
      displayName: u.displayName,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      currentStreak: u.currentStreak,
      currentStreakType: u.currentStreakType,
      onFire: u.currentStreakType === "win" && u.currentStreak >= 3,
    });
  }

  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const home = table.get(m.homeUserId);
    const away = table.get(m.awayUserId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.won++;
      home.points += 3 + (m.homeBonusPts ?? 0);
      away.lost++;
      away.points += m.awayBonusPts ?? 0;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      away.points += 3 + (m.awayBonusPts ?? 0);
      home.lost++;
      home.points += m.homeBonusPts ?? 0;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1 + (m.homeBonusPts ?? 0);
      away.points += 1 + (m.awayBonusPts ?? 0);
    }
  }

  Array.from(table.values()).forEach((row) => {
    row.gd = row.gf - row.ga;
  });

  return Array.from(table.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamName.localeCompare(b.teamName);
  });
}

// Streak + cash bonuses live in ./streaks.ts (Phase 8)
export { applyMatchStreaks } from "./streaks";

