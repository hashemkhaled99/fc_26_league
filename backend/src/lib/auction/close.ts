import type { RoomSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearAuctionEnd } from "@/lib/timerStore";
import { canUserWinAuction } from "./budget";
import { nextListingEndsAt } from "./listings";

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

async function returnResaleToSeller(auction: {
  id: string;
  playerId: string;
  sellerId: string | null;
  isResale: boolean;
  currentBid: number;
}) {
  if (auction.isResale && auction.sellerId) {
    await prisma.$transaction([
      prisma.auction.update({
        where: { id: auction.id },
        data: { status: "cancelled" },
      }),
      prisma.player.update({
        where: { id: auction.playerId },
        data: { status: "owned" },
      }),
      prisma.squadPlayer.create({
        data: {
          userId: auction.sellerId,
          playerId: auction.playerId,
          purchasePrice: auction.currentBid,
          isStarting: false,
        },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.auction.update({
        where: { id: auction.id },
        data: { status: "cancelled" },
      }),
      prisma.player.update({
        where: { id: auction.playerId },
        data: { status: "available", listingEndsAt: nextListingEndsAt() },
      }),
    ]);
  }
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

  const ops = [
    prisma.auction.update({
      where: { id: auctionId },
      data: { status: "closed" },
    }),
    prisma.player.update({
      where: { id: auction.playerId },
      data: { status: "owned" },
    }),
    prisma.user.update({
      where: { id: winnerId },
      data: { budget: { decrement: finalBid } },
    }),
    prisma.squadPlayer.create({
      data: {
        userId: winnerId,
        playerId: auction.playerId,
        purchasePrice: finalBid,
        isStarting: false,
      },
    }),
  ];

  // Resale: pay the seller
  if (auction.isResale && auction.sellerId) {
    ops.push(
      prisma.user.update({
        where: { id: auction.sellerId },
        data: { budget: { increment: finalBid } },
      })
    );
  }

  await prisma.$transaction(ops);

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
