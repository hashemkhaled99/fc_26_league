import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatBoostedStats,
  parseBoostedStats,
  rollBoostedStats,
  type BoostedStat,
} from "@/lib/players/faceStats";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type BoostResultPlayer = {
  playerId: string;
  name: string;
  position: string;
  from: number;
  to: number;
  stats: BoostedStat[];
  statsLabel: string;
};

/** Randomly boost up to 2 players in each user's squad (+2 to +5 rating + face stats). */
export async function applyBotBoost(roomId: string) {
  const users = await prisma.user.findMany({
    where: { roomId },
    select: { id: true, teamName: true },
  });

  const results: Array<{
    userId: string;
    teamName: string;
    boosted: BoostResultPlayer[];
  }> = [];

  for (const user of users) {
    const squad = await prisma.squadPlayer.findMany({
      where: { userId: user.id },
      include: { player: true },
    });
    if (squad.length === 0) {
      results.push({ userId: user.id, teamName: user.teamName, boosted: [] });
      continue;
    }

    const count = Math.min(squad.length, 1 + Math.floor(Math.random() * 2)); // 1 or 2
    const picks = shuffle(squad).slice(0, count);
    const boosted: BoostResultPlayer[] = [];

    for (const entry of picks) {
      const base = entry.player.boostedRating ?? entry.player.baseRating;
      // +2..+5 so every boost is clearly felt (never a lonely +1)
      const bump = 2 + Math.floor(Math.random() * 4);
      const to = Math.min(99, base + bump);
      const actualBump = to - base;
      if (actualBump <= 0) continue;

      const previous = parseBoostedStats(entry.player.boostedStats);
      const stats = rollBoostedStats(entry.player.position, actualBump, previous);

      await prisma.player.update({
        where: { id: entry.playerId },
        data: {
          boostedRating: to,
          boostedStats: stats as unknown as Prisma.InputJsonValue,
        },
      });
      boosted.push({
        playerId: entry.playerId,
        name: entry.player.name,
        position: entry.player.position,
        from: base,
        to,
        stats,
        statsLabel: formatBoostedStats(stats),
      });
    }

    results.push({ userId: user.id, teamName: user.teamName, boosted });
  }

  return results;
}
