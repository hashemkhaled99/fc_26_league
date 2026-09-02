import { prisma } from "@/lib/prisma";
import { clearAuctionEnd } from "@/lib/timerStore";

/**
 * Admin repair: move a player onto a manager's squad (no budget change).
 * Cancels any live auction for that player first.
 */
export async function forceAssignPlayer(opts: {
  roomId: string;
  playerName: string;
  toUserId: string;
}): Promise<{
  playerId: string;
  playerName: string;
  toUserId: string;
  toTeamName: string;
  fromUserId: string | null;
  fromTeamName: string | null;
  purchasePrice: number;
}> {
  const needle = opts.playerName.trim();
  if (needle.length < 2) throw new Error("Player name too short");

  const toUser = await prisma.user.findFirst({
    where: { id: opts.toUserId, roomId: opts.roomId },
    select: { id: true, teamName: true, displayName: true },
  });
  if (!toUser) throw new Error("Target manager not found in this room");

  const candidates = await prisma.player.findMany({
    where: {
      roomId: opts.roomId,
      name: { contains: needle, mode: "insensitive" },
      isIcon: false,
      isHero: false,
    },
    select: {
      id: true,
      name: true,
      marketValue: true,
      baseRating: true,
      status: true,
    },
    orderBy: { baseRating: "desc" },
    take: 10,
  });

  if (candidates.length === 0) {
    throw new Error(`No player matching "${needle}" in this room`);
  }

  // Prefer exact / starts-with match over partial (e.g. "Vini" → "Vini Jr." not random)
  const lower = needle.toLowerCase();
  const player =
    candidates.find((p) => p.name.toLowerCase() === lower) ??
    candidates.find((p) => p.name.toLowerCase().startsWith(lower)) ??
    candidates[0];

  const existing = await prisma.squadPlayer.findUnique({
    where: { playerId: player.id },
    select: {
      userId: true,
      purchasePrice: true,
      user: { select: { teamName: true } },
    },
  });

  if (existing?.userId === toUser.id) {
    await prisma.player.update({
      where: { id: player.id },
      data: { status: "owned", listingEndsAt: null },
    });
    return {
      playerId: player.id,
      playerName: player.name,
      toUserId: toUser.id,
      toTeamName: toUser.teamName,
      fromUserId: existing.userId,
      fromTeamName: existing.user.teamName,
      purchasePrice: existing.purchasePrice,
    };
  }

  const live = await prisma.auction.findMany({
    where: { roomId: opts.roomId, playerId: player.id, status: "active" },
    select: { id: true },
  });
  for (const a of live) {
    await clearAuctionEnd(a.id);
  }
  if (live.length > 0) {
    await prisma.auction.updateMany({
      where: { id: { in: live.map((a) => a.id) } },
      data: { status: "cancelled" },
    });
  }

  const purchasePrice = existing?.purchasePrice ?? player.marketValue;

  await prisma.$transaction(async (tx) => {
    await tx.squadPlayer.deleteMany({ where: { playerId: player.id } });
    await tx.squadPlayer.create({
      data: {
        userId: toUser.id,
        playerId: player.id,
        purchasePrice,
        isStarting: false,
      },
    });
    await tx.player.update({
      where: { id: player.id },
      data: { status: "owned", listingEndsAt: null },
    });
  });

  return {
    playerId: player.id,
    playerName: player.name,
    toUserId: toUser.id,
    toTeamName: toUser.teamName,
    fromUserId: existing?.userId ?? null,
    fromTeamName: existing?.user.teamName ?? null,
    purchasePrice,
  };
}
