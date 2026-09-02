import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canUserBid } from "@/lib/auction/budget";
import { DEFAULT_STARTING_BID, SQUAD_LIMIT } from "@/lib/auction/constants";
import { isMarketLocked } from "@/lib/auction/close";
import { getMarketWindowEnd, secondsUntilMarketWindowEnd, getRebidAuctionEnd, secondsUntilRebidEnd, isPastMarketDeadline, isUnbidPlayer } from "@/lib/auction/listings";
import { setAuctionEnd } from "@/lib/timerStore";
import { consumeOneShotEffect, getActiveEffects, getPriceTrap } from "@/lib/cards/effects";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const schema = z.object({
  playerId: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const body = await request.json();
    const { playerId } = schema.parse(body);

    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });

    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");
    if (room.phase !== "bidding") return apiError("Market is not open");

    if (isMarketLocked(room.settings) && !room.settings?.rebidRoundEnabled) {
      return apiError("Transfer window has closed");
    }

    const rebidRound = room.settings?.rebidRoundEnabled ?? false;

    if (!rebidRound && isPastMarketDeadline()) {
      return apiError("Market deadline (9:00 PM) has passed");
    }

    const player = await prisma.player.findFirst({
      where: { id: playerId, roomId: room.id },
    });

    if (!player) return apiError("Player not found");
    if (player.status !== "available") return apiError("Player is not available");
    if (player.isIcon || player.isHero) return apiError("Special players cannot be auctioned");

    const existingAuction = await prisma.auction.findFirst({
      where: { playerId, status: "active" },
    });
    if (existingAuction) return apiError("Auction already active for this player");

    if (rebidRound) {
      const unbid = await isUnbidPlayer(playerId);
      if (!unbid) {
        return apiError("Rebid round is only for players that were never bid on");
      }
    }

    let startingPrice = DEFAULT_STARTING_BID;
    const bargain = await consumeOneShotEffect(room.id, "bargain_hunter", session.userId);
    if (bargain) startingPrice = 4_000_000;

    const effects = await getActiveEffects(room.id);
    const trap = getPriceTrap(effects, playerId);
    if (trap) {
      startingPrice = Math.floor(startingPrice * 1.5);
      await prisma.marketEffect.delete({ where: { id: trap.id } });
    }

    const softCap = effects.find(
      (e) => e.type === "soft_cap" && e.casterId === session.userId
    );
    const bidCheck = await canUserBid(session.userId, startingPrice, {
      squadLimit: softCap ? SQUAD_LIMIT + 1 : SQUAD_LIMIT,
    });
    if (!bidCheck.ok) return apiError(bidCheck.reason ?? "Cannot start auction");

    const endsAt = rebidRound ? getRebidAuctionEnd() : getMarketWindowEnd();
    const timerSeconds = rebidRound ? secondsUntilRebidEnd() : secondsUntilMarketWindowEnd();

    const starter = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, displayName: true, teamName: true },
    });

    const auction = await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: playerId },
        data: { status: "in_auction" },
      });

      const created = await tx.auction.create({
        data: {
          roomId: room.id,
          playerId,
          startingPrice,
          currentBid: startingPrice,
          currentBidderId: session.userId,
          status: "active",
          endsAt,
        },
        include: { player: true },
      });

      await tx.bid.create({
        data: {
          auctionId: created.id,
          userId: session.userId,
          amount: startingPrice,
        },
      });

      return created;
    });

    await setAuctionEnd(auction.id, endsAt);

    const auctionData = {
      id: auction.id,
      playerId: auction.playerId,
      player: auction.player,
      startingPrice: auction.startingPrice,
      currentBid: auction.currentBid,
      currentBidderId: session.userId,
      currentBidder: starter,
      endsAt: endsAt.toISOString(),
      isResale: false,
      timerSeconds,
    };

    await emitToRoom(code, "auction:started", auctionData);
    await emitToRoom(code, "bid:placed", {
      auctionId: auction.id,
      amount: startingPrice,
      bidder: starter,
      currentBid: startingPrice,
      currentBidderId: session.userId,
      endsAt: endsAt.toISOString(),
      timerSeconds,
      playerName: player.name,
    });

    return apiSuccess({ auction: auctionData });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Start auction error:", err);
    return apiError("Failed to start auction", 500);
  }
}
