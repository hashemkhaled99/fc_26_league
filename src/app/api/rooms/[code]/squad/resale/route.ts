import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getBidTimerSeconds, isMarketLocked } from "@/lib/auction/close";
import { setAuctionExpiry } from "@/lib/auction/redis";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const schema = z.object({
  squadPlayerId: z.string(),
  startingPrice: z.number().int().min(1000000),
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
    const { squadPlayerId, startingPrice } = schema.parse(body);

    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });

    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");
    if (room.phase !== "bidding") return apiError("Market is not open for resale");

    if (isMarketLocked(room.settings)) {
      return apiError("Transfer window has closed");
    }

    const entry = await prisma.squadPlayer.findFirst({
      where: { id: squadPlayerId, userId: session.userId },
      include: { player: true },
    });

    if (!entry) return apiError("Player not in your squad");
    if (entry.player.status !== "owned") return apiError("Player cannot be listed");

    const existingAuction = await prisma.auction.findFirst({
      where: { playerId: entry.playerId, status: "active" },
    });
    if (existingAuction) return apiError("Auction already active for this player");

    const timerSeconds = getBidTimerSeconds(room.settings);
    const endsAt = new Date(Date.now() + timerSeconds * 1000);

    const seller = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, displayName: true, teamName: true },
    });

    const auction = await prisma.$transaction(async (tx) => {
      // Remove from seller squad while listed
      await tx.squadPlayer.delete({ where: { id: entry.id } });

      await tx.player.update({
        where: { id: entry.playerId },
        data: { status: "in_auction" },
      });

      return tx.auction.create({
        data: {
          roomId: room.id,
          playerId: entry.playerId,
          startingPrice,
          currentBid: startingPrice,
          currentBidderId: null,
          sellerId: session.userId,
          isResale: true,
          status: "active",
          endsAt,
        },
        include: { player: true },
      });
    });

    await setAuctionExpiry(auction.id, endsAt);

    const auctionData = {
      id: auction.id,
      playerId: auction.playerId,
      player: auction.player,
      startingPrice: auction.startingPrice,
      currentBid: auction.currentBid,
      currentBidderId: null,
      currentBidder: null,
      sellerId: session.userId,
      seller,
      endsAt: endsAt.toISOString(),
      isResale: true,
      timerSeconds,
    };

    await emitToRoom(code, "auction:started", auctionData);
    await emitToRoom(code, "squad:updated", { userId: session.userId });

    return apiSuccess({ auction: auctionData });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Resale error:", err);
    return apiError("Failed to list player for resale", 500);
  }
}
