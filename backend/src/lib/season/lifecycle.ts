import { prisma } from "@/lib/prisma";
import { calculateSeasonAwards, payLeaguePrizes } from "@/lib/awards/engine";
import { distributeTransferCards } from "@/lib/cards/distribute";
import { forceCloseAllAuctions } from "@/lib/admin/market";
import { returnAllActiveLoans } from "@/lib/loans/engine";

/** End the league season → awards + prizes + season_end phase. */
export async function endSeason(roomId: string, _roomCode: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("Room not found");
  if (room.phase !== "league") throw new Error("Room must be in league phase");

  const season = room.currentSeason;

  const open = await prisma.match.count({
    where: {
      roomId,
      season,
      status: { not: "confirmed" },
    },
  });

  const awards = await calculateSeasonAwards(roomId, season);
  const prizes = await payLeaguePrizes(roomId, season);

  await prisma.room.update({
    where: { id: roomId },
    data: { phase: "season_end" },
  });

  return { season, awards, prizes, unconfirmedMatches: open };
}

/**
 * Start next season: keep squads & budgets, reset streaks/cards/effects,
 * reopen bidding, increment season.
 */
export async function startNewSeason(roomId: string, roomCode: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("Room not found");
  if (room.phase !== "season_end") {
    throw new Error("End the season first (awards ceremony)");
  }

  await forceCloseAllAuctions(roomId, roomCode);
  await returnAllActiveLoans(roomId);

  const newSeason = room.currentSeason + 1;

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { roomId },
      data: {
        currentStreak: 0,
        currentStreakType: null,
        bestStreakSeason: 0,
      },
    }),
    prisma.card.deleteMany({ where: { roomId } }),
    prisma.marketEffect.deleteMany({ where: { roomId } }),
    prisma.tradeRequest.updateMany({
      where: { roomId, status: "pending" },
      data: { status: "rejected" },
    }),
    prisma.loan.updateMany({
      where: { roomId, status: "pending" },
      data: { status: "cancelled" },
    }),
    prisma.roomSettings.upsert({
      where: { roomId },
      create: { roomId, transferWindowEndsAt: null },
      update: {
        transferWindowEndsAt: null,
        rebidRoundEnabled: false,
        deadlineStartsAt: null,
        deadlineEndsAt: null,
      },
    }),
    prisma.room.update({
      where: { id: roomId },
      data: {
        phase: "bidding",
        currentSeason: newSeason,
      },
    }),
  ]);

  const cards = await distributeTransferCards(roomId, 2);

  return { season: newSeason, cards };
}
