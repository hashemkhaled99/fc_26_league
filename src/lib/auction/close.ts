import type { RoomSettings, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearAuctionEnd, setAuctionEnd } from "@/lib/timerStore";
import { canUserWinAuction } from "./budget";
import { getMarketWindowEnd } from "./listings";

export function getBidTimerSeconds(settings: RoomSettings | null, now = new Date()): number {
  if (!settings) return 60;

  const deadlineEnd =
    settings.deadlineEndsAt ?? settings.transferWindowEndsAt ?? null;

  if (
    settings.deadlineDayEnabled &&
    settings.deadlineStartsAt &&
    deadlineEnd &&
    now >= settings.deadlineStartsAt &&
    now <= deadlineEnd
  ) {
    return settings.deadlineBidTimerSeconds;
  }

  return settings.bidTimerSeconds;
}

export function isMarketLocked(settings: RoomSettings | null, now = new Date()): boolean {
  if (settings?.rebidRoundEnabled) return false;
  if (!settings?.transferWindowEndsAt) return false;
  return now >= settings.transferWindowEndsAt;
}

export interface ClosedAuctionResult {
  auctionId: string;
  status: "closed" | "cancelled";
  winnerId?: string;
  winnerName?: string;
  winnerTeam?: string;
  sellerId?: string;
  playerId: string;
  playerName: string;
  finalBid: number;
  roomCode: string;
  isResale: boolean;
}

type Tx = Prisma.TransactionClient;

/** Always replace squad ownership — never hit P2002 from a stale row. */
async function assignSquadPlayer(
  tx: Tx,
  data: { userId: string; playerId: string; purchasePrice: number }
) {
  await tx.squadPlayer.deleteMany({ where: { playerId: data.playerId } });
  await tx.squadPlayer.create({
    data: {
      userId: data.userId,
      playerId: data.playerId,
      purchasePrice: data.purchasePrice,
      isStarting: false,
    },
  });
}

async function returnResaleToSeller(auction: {
  id: string;
  playerId: string;
  sellerId: string | null;
  isResale: boolean;
  currentBid: number;
}) {
  // Claim cancel first so concurrent closers cannot double-process.
  const claimed = await prisma.auction.updateMany({
    where: { id: auction.id, status: "active" },
    data: { status: "cancelled" },
  });
  if (claimed.count === 0) return;

  if (auction.isResale && auction.sellerId) {
    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: auction.playerId },
        data: { status: "owned" },
      });
      await assignSquadPlayer(tx, {
        userId: auction.sellerId!,
        playerId: auction.playerId,
        purchasePrice: auction.currentBid,
      });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.squadPlayer.deleteMany({ where: { playerId: auction.playerId } });
      await tx.player.update({
        where: { id: auction.playerId },
        data: { status: "available", listingEndsAt: getMarketWindowEnd() },
      });
    });
  }
}

/**
 * Last-resort: stop the auction closer death-loop.
 * Marks auction cancelled and puts the player back on the market.
 */
export async function abandonAuctionToMarket(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, playerId: true, status: true },
  });
  if (!auction) return;

  await clearAuctionEnd(auctionId);
  if (auction.status === "active") {
    await prisma.auction.updateMany({
      where: { id: auctionId, status: "active" },
      data: { status: "cancelled" },
    });
  }

  await prisma.squadPlayer.deleteMany({ where: { playerId: auction.playerId } });
  await prisma.player.updateMany({
    where: {
      id: auction.playerId,
      status: { in: ["in_auction", "owned", "available"] },
      isIcon: false,
      isHero: false,
    },
    data: { status: "available", listingEndsAt: getMarketWindowEnd() },
  });
}

/** Close an auction — winner gets player, budget deducted, or cancel if no bids */
export async function closeAuction(auctionId: string): Promise<ClosedAuctionResult | null> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      player: true,
      room: true,
    },
  });

  if (!auction || auction.status !== "active") return null;

  await clearAuctionEnd(auctionId);

  // No bids — cancel and release / return to seller
  if (!auction.currentBidderId) {
    await returnResaleToSeller(auction);

    return {
      auctionId,
      status: "cancelled",
      sellerId: auction.sellerId ?? undefined,
      playerId: auction.playerId,
      playerName: auction.player.name,
      finalBid: auction.currentBid,
      roomCode: auction.room.code,
      isResale: auction.isResale,
    };
  }

  const winnerId = auction.currentBidderId;
  const finalBid = auction.currentBid;

  const winner = await prisma.user.findUnique({
    where: { id: winnerId },
    select: { id: true, displayName: true, teamName: true, budget: true },
  });

  if (!winner) {
    await returnResaleToSeller(auction);
    return null;
  }

  const winCheck = await canUserWinAuction(winnerId);
  if (!winCheck.ok || winner.budget < finalBid) {
    await returnResaleToSeller(auction);
    return {
      auctionId,
      status: "cancelled",
      sellerId: auction.sellerId ?? undefined,
      playerId: auction.playerId,
      playerName: auction.player.name,
      finalBid,
      roomCode: auction.room.code,
      isResale: auction.isResale,
    };
  }

  // Can't buy your own resale (shouldn't happen, but guard)
  if (auction.isResale && auction.sellerId === winnerId) {
    await returnResaleToSeller(auction);
    return {
      auctionId,
      status: "cancelled",
      sellerId: auction.sellerId,
      playerId: auction.playerId,
      playerName: auction.player.name,
      finalBid,
      roomCode: auction.room.code,
      isResale: true,
    };
  }

  // Claim the auction first so concurrent closers cannot double-award.
  const claimed = await prisma.auction.updateMany({
    where: { id: auctionId, status: "active" },
    data: { status: "closed" },
  });
  if (claimed.count === 0) return null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: auction.playerId },
        data: { status: "owned" },
      });
      await tx.user.update({
        where: { id: winnerId },
        data: { budget: { decrement: finalBid } },
      });
      await assignSquadPlayer(tx, {
        userId: winnerId,
        playerId: auction.playerId,
        purchasePrice: finalBid,
      });
      if (auction.isResale && auction.sellerId) {
        await tx.user.update({
          where: { id: auction.sellerId },
          data: { budget: { increment: finalBid } },
        });
      }
    });
  } catch (err) {
    console.error(`closeAuction transfer failed for ${auctionId}:`, err);
    try {
      await prisma.$transaction(async (tx) => {
        await assignSquadPlayer(tx, {
          userId: winnerId,
          playerId: auction.playerId,
          purchasePrice: finalBid,
        });
        await tx.player.update({
          where: { id: auction.playerId },
          data: { status: "owned" },
        });
      });
    } catch (err2) {
      console.error(`closeAuction recovery failed for ${auctionId}:`, err2);
      // Don't leave an endless active closer loop — release to market.
      await abandonAuctionToMarket(auctionId);
      return {
        auctionId,
        status: "cancelled",
        sellerId: auction.sellerId ?? undefined,
        playerId: auction.playerId,
        playerName: auction.player.name,
        finalBid,
        roomCode: auction.room.code,
        isResale: auction.isResale,
      };
    }
  }

  // Fee rebate card: refund 10% of winning bid once
  const rebate = await prisma.marketEffect.findFirst({
    where: { roomId: auction.roomId, type: "fee_rebate", casterId: winnerId },
  });
  if (rebate) {
    const refund = Math.floor(finalBid * 0.1);
    await prisma.user.update({
      where: { id: winnerId },
      data: { budget: { increment: refund } },
    });
    await prisma.marketEffect.delete({ where: { id: rebate.id } });
  }

  return {
    auctionId,
    status: "closed",
    winnerId,
    winnerName: winner.displayName,
    winnerTeam: winner.teamName,
    sellerId: auction.sellerId ?? undefined,
    playerId: auction.playerId,
    playerName: auction.player.name,
    finalBid,
    roomCode: auction.room.code,
    isResale: auction.isResale,
  };
}

/**
 * Emergency repair: cancel live auctions, clear all regular squads (refund purchase price),
 * put every non-icon/non-hero player back on the market with the shared 9:45 PM deadline.
 */
export async function returnAllPlayersToMarket(roomId: string): Promise<{
  cancelledAuctions: number;
  releasedPlayers: number;
  refundedBudget: number;
  marketDeadline: string;
}> {
  const endsAt = getMarketWindowEnd();

  const active = await prisma.auction.findMany({
    where: { roomId, status: "active" },
    select: { id: true },
  });
  for (const a of active) {
    await clearAuctionEnd(a.id);
  }
  await prisma.auction.updateMany({
    where: { roomId, status: "active" },
    data: { status: "cancelled" },
  });

  const squad = await prisma.squadPlayer.findMany({
    where: {
      user: { roomId },
      player: { isIcon: false, isHero: false },
    },
    select: {
      id: true,
      userId: true,
      playerId: true,
      purchasePrice: true,
    },
  });

  let refundedBudget = 0;
  for (const entry of squad) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: entry.userId },
        data: { budget: { increment: entry.purchasePrice } },
      }),
      prisma.squadPlayer.delete({ where: { id: entry.id } }),
      prisma.player.update({
        where: { id: entry.playerId },
        data: { status: "available", listingEndsAt: endsAt },
      }),
    ]);
    refundedBudget += entry.purchasePrice;
  }

  await prisma.player.updateMany({
    where: {
      roomId,
      isIcon: false,
      isHero: false,
      status: { in: ["in_auction", "owned", "available"] },
    },
    data: { status: "available", listingEndsAt: endsAt },
  });

  await prisma.squadPlayer.deleteMany({
    where: {
      user: { roomId },
      player: { isIcon: false, isHero: false },
    },
  });

  await prisma.roomSettings.upsert({
    where: { roomId },
    create: {
      roomId,
      transferWindowEndsAt: endsAt,
      rebidRoundEnabled: false,
    },
    update: {
      transferWindowEndsAt: endsAt,
      rebidRoundEnabled: false,
    },
  });

  return {
    cancelledAuctions: active.length,
    releasedPlayers: squad.length,
    refundedBudget,
    marketDeadline: endsAt.toISOString(),
  };
}

/** Push every live auction + available listing to the shared 9:45 PM window. */
export async function forceMarketDeadline(roomId: string): Promise<{
  listings: number;
  auctions: number;
  marketDeadline: string;
}> {
  const endsAt = getMarketWindowEnd();

  const listings = await prisma.player.updateMany({
    where: {
      roomId,
      status: "available",
      isIcon: false,
      isHero: false,
    },
    data: { listingEndsAt: endsAt },
  });

  const live = await prisma.auction.findMany({
    where: { roomId, status: "active" },
    select: { id: true },
  });
  if (live.length > 0) {
    await prisma.auction.updateMany({
      where: { id: { in: live.map((a) => a.id) } },
      data: { endsAt },
    });
    await Promise.all(live.map((a) => setAuctionEnd(a.id, endsAt)));
  }

  await prisma.roomSettings.upsert({
    where: { roomId },
    create: { roomId, transferWindowEndsAt: endsAt, rebidRoundEnabled: false },
    update: { transferWindowEndsAt: endsAt, rebidRoundEnabled: false },
  });

  return {
    listings: listings.count,
    auctions: live.length,
    marketDeadline: endsAt.toISOString(),
  };
}
