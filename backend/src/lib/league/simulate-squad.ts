import { prisma } from "@/lib/prisma";
import { getLoanedOutPlayerIds } from "@/lib/loans/engine";
import type { SimPlayer } from "./simulate";

/** Load a user's full squad for simulation (owned + active loans). */
export async function loadSimSquad(userId: string): Promise<SimPlayer[]> {
  const [owned, loanedOutIds, borrowed] = await Promise.all([
    prisma.squadPlayer.findMany({
      where: { userId },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            baseRating: true,
            boostedRating: true,
            isHero: true,
            isIcon: true,
            tier: true,
          },
        },
      },
    }),
    getLoanedOutPlayerIds(userId),
    prisma.loan.findMany({
      where: { borrowerId: userId, status: "active" },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            baseRating: true,
            boostedRating: true,
            isHero: true,
            isIcon: true,
            tier: true,
          },
        },
      },
    }),
  ]);

  const ownedPlayers: Array<SimPlayer & { isStarting: boolean }> = owned
    .filter((s) => !loanedOutIds.has(s.player.id))
    .map((s) => ({
      id: s.player.id,
      name: s.player.name,
      position: s.player.position,
      rating: s.player.boostedRating ?? s.player.baseRating,
      isHero: s.player.isHero || s.player.tier === "HERO",
      isIcon: s.player.isIcon || s.player.tier === "ICON",
      isStarting: s.isStarting,
    }));

  const loanPlayers: Array<SimPlayer & { isStarting: boolean }> = borrowed.map((loan) => ({
    id: loan.player.id,
    name: loan.player.name,
    position: loan.player.position,
    rating: loan.player.boostedRating ?? loan.player.baseRating,
    isHero: loan.player.isHero || loan.player.tier === "HERO",
    isIcon: loan.player.isIcon || loan.player.tier === "ICON",
    isStarting: loan.borrowerIsStarting,
  }));

  return [...ownedPlayers, ...loanPlayers];
}

export async function loadSimSquadWithStarters(userId: string): Promise<{
  players: SimPlayer[];
  starterIds: string[];
}> {
  const [owned, loanedOutIds, borrowed] = await Promise.all([
    prisma.squadPlayer.findMany({
      where: { userId },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            baseRating: true,
            boostedRating: true,
            isHero: true,
            isIcon: true,
            tier: true,
          },
        },
      },
      orderBy: { player: { baseRating: "desc" } },
    }),
    getLoanedOutPlayerIds(userId),
    prisma.loan.findMany({
      where: { borrowerId: userId, status: "active" },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            baseRating: true,
            boostedRating: true,
            isHero: true,
            isIcon: true,
            tier: true,
          },
        },
      },
    }),
  ]);

  type Row = SimPlayer & { isStarting: boolean };
  const rows: Row[] = [
    ...owned
      .filter((s) => !loanedOutIds.has(s.player.id))
      .map((s) => ({
        id: s.player.id,
        name: s.player.name,
        position: s.player.position,
        rating: s.player.boostedRating ?? s.player.baseRating,
        isHero: s.player.isHero || s.player.tier === "HERO",
        isIcon: s.player.isIcon || s.player.tier === "ICON",
        isStarting: s.isStarting,
      })),
    ...borrowed.map((loan) => ({
      id: loan.player.id,
      name: loan.player.name,
      position: loan.player.position,
      rating: loan.player.boostedRating ?? loan.player.baseRating,
      isHero: loan.player.isHero || loan.player.tier === "HERO",
      isIcon: loan.player.isIcon || loan.player.tier === "ICON",
      isStarting: loan.borrowerIsStarting,
    })),
  ];

  const players: SimPlayer[] = rows.map(({ isStarting: _s, ...p }) => p);
  let starterIds = rows.filter((r) => r.isStarting).map((r) => r.id);
  if (starterIds.length < 11) {
    const used = new Set(starterIds);
    const fill = [...rows]
      .sort((a, b) => b.rating - a.rating)
      .filter((r) => !used.has(r.id));
    for (const r of fill) {
      if (starterIds.length >= 11) break;
      starterIds.push(r.id);
    }
  }
  starterIds = starterIds.slice(0, 11);

  return { players, starterIds };
}
