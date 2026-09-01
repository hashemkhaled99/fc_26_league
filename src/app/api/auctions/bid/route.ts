import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canUserBid, getAvailableBudget } from "@/lib/auction/budget";
import { isMarketLocked } from "@/lib/auction/close";
import { setAuctionEnd } from "@/lib/timerStore";
import {
  MIN_BID_INCREMENT,
  BID_RATE_LIMIT_MS,
  SQUAD_LIMIT,
  BID_EXTEND_BY_SEC,
  BID_EXTEND_THRESHOLD_SEC,
} from "@/lib/auction/constants";
import {
  getActiveEffects,
  getBidBan,
  getExclusiveRights,
  getSniperGuard,
  getFirstDibs,
  getBidShield,
  consumeOneShotEffect,
} from "@/lib/cards/effects";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const lastBidTime = new Map<string, number>();

const bidSchema = z.object({
  auctionId: z.string(),
  amount: z.number().int().min(1000000),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const body = await request.json();
    const { auctionId, amount } = bidSchema.parse(body);

    const now = Date.now();
    const last = lastBidTime.get(session.userId) ?? 0;
    if (now - last < BID_RATE_LIMIT_MS) {
      return apiError("Too fast — wait a moment");
    }

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        player: true,
        room: { include: { settings: true } },
      },
    });

    if (!auction) return apiError("Auction not found");
    if (auction.status !== "active") return apiError("Auction is no longer active");
    if (auction.roomId !== session.roomId) return apiError("Wrong room");

    if (isMarketLocked(auction.room.settings)) {
      return apiError("Transfer window has closed");
    }

    if (auction.endsAt.getTime() <= now) {
      return apiError("Auction has expired");
    }

    if (auction.currentBidderId === session.userId) {
      return apiError("You are already the highest bidder");
    }

    if (auction.isResale && auction.sellerId === session.userId) {
      return apiError("You cannot bid on your own resale listing");
    }

    const effects = await getActiveEffects(auction.roomId);
    if (getBidBan(effects, auctionId, session.userId, now)) {
      return apiError("You are bid-banned on this auction");
    }
    const exclusive = getExclusiveRights(effects, auctionId, now);
    if (exclusive && exclusive.casterId !== session.userId) {
      return apiError("Exclusive rights active — only one manager can bid");
    }
    const dibs = getFirstDibs(effects, auctionId, now);
    if (dibs && dibs.casterId !== session.userId) {
      return apiError("First Dibs active — wait for the exclusive window");
    }
    const sniper = getSniperGuard(effects, auctionId, now);
    if (sniper && sniper.casterId !== session.userId) {
      return apiError("Sniper Guard — this bid is protected briefly");
    }

    const softPending = effects.find(
      (e) => e.type === "soft_raise" && e.casterId === session.userId
    );
    const minBid = auction.currentBidderId
      ? softPending
        ? auction.currentBid
        : auction.currentBid + MIN_BID_INCREMENT
      : auction.currentBid;

    const shield = getBidShield(effects, auctionId, now);
    if (shield && auction.currentBidderId === shield.casterId) {
      const extra = Number((shield.payload as { extra?: number } | null)?.extra ?? 3_000_000);
      if (amount < auction.currentBid + extra) {
        return apiError(`Bid Shield: need +${(extra / 1_000_000).toFixed(0)}M to take the lead`);
      }
    }

    if (amount < minBid) {
      return apiError(`Minimum bid is ${minBid.toLocaleString()}`);
    }

    const overdraft = effects.find(
      (e) => e.type === "overdraft" && e.casterId === session.userId
    );
    const softCap = effects.find(
      (e) => e.type === "soft_cap" && e.casterId === session.userId
    );
    const allowance = overdraft
      ? Number((overdraft.payload as { allowance?: number } | null)?.allowance ?? 5_000_000)
      : 0;
    const bidCheck = await canUserBid(session.userId, amount, {
      overdraftAllowance: allowance,
      squadLimit: softCap ? SQUAD_LIMIT + 1 : SQUAD_LIMIT,
    });
    if (!bidCheck.ok) return apiError(bidCheck.reason ?? "Cannot bid");

    const available = await getAvailableBudget(session.userId);
    if (overdraft && amount > available) {
      await prisma.marketEffect.delete({ where: { id: overdraft.id } });
    }

    const remainingSec = (auction.endsAt.getTime() - now) / 1000;
    const endsAt =
      remainingSec <= BID_EXTEND_THRESHOLD_SEC
        ? new Date(auction.endsAt.getTime() + BID_EXTEND_BY_SEC * 1000)
        : auction.endsAt;
    const timerSeconds = Math.max(0, Math.ceil((endsAt.getTime() - now) / 1000));
    const expectedBid = auction.currentBid;

    const updateResult = await prisma.auction.updateMany({
      where: {
        id: auctionId,
        status: "active",
        currentBid: expectedBid,
      },
      data: {
        currentBid: amount,
        currentBidderId: session.userId,
        endsAt,
      },
    });

    if (updateResult.count === 0) {
      return apiError("Bid rejected — someone else bid. Try again.");
    }

    const refreshed = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (refreshed?.currentBidderId !== session.userId) {
      return apiError("Bid rejected — someone else bid. Try again.");
    }

    await prisma.bid.create({
      data: {
        auctionId,
        userId: session.userId,
        amount,
      },
    });

    if (softPending) {
      await prisma.marketEffect.delete({ where: { id: softPending.id } });
    }

    lastBidTime.set(session.userId, now);
    await setAuctionEnd(auctionId, endsAt);

    const bidder = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, displayName: true, teamName: true },
    });

    const bidData = {
      auctionId,
      amount,
      bidder,
      currentBid: amount,
      currentBidderId: session.userId,
      endsAt: endsAt.toISOString(),
      timerSeconds,
      playerName: auction.player.name,
    };

    const silent = await consumeOneShotEffect(auction.roomId, "silent_bid", session.userId);
    if (!silent) {
      await emitToRoom(auction.room.code, "bid:placed", bidData);
    } else {
      await emitToRoom(auction.room.code, "auction:updated", {
        auctionId,
        currentBid: amount,
        currentBidderId: session.userId,
        endsAt: endsAt.toISOString(),
      });
    }

    return apiSuccess(bidData);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Place bid error:", err);
    return apiError("Failed to place bid", 500);
  }
}
