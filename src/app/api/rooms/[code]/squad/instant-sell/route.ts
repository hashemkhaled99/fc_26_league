import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMarketLocked } from "@/lib/auction/close";
import { getMarketWindowEnd } from "@/lib/auction/listings";
import { getActiveLoanForPlayer } from "@/lib/loans/engine";
import { notifyBudgetUpdated } from "@/lib/admin/users";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

/** Instant sell refund = 50% of what the manager paid. */
function instantSellRefund(purchasePrice: number): number {
  return Math.floor(Math.max(0, purchasePrice) / 2);
}

const schema = z.object({
  squadPlayerId: z.string(),
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
    const { squadPlayerId } = schema.parse(body);

    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });

    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");
    if (room.phase !== "bidding") return apiError("Market is not open for selling");

    if (isMarketLocked(room.settings)) {
      return apiError("Transfer window has closed");
    }

    const entry = await prisma.squadPlayer.findFirst({
      where: { id: squadPlayerId, userId: session.userId },
      include: { player: true },
    });

    if (!entry) return apiError("Player not in your squad");
    if (entry.player.status !== "owned") return apiError("Player cannot be sold");
    if (entry.player.isIcon || entry.player.isHero) {
      return apiError("Special players cannot be instant sold");
    }

    const activeLoan = await getActiveLoanForPlayer(entry.playerId);
    if (activeLoan) return apiError("Cannot sell a player who is on loan");

    const existingAuction = await prisma.auction.findFirst({
      where: { playerId: entry.playerId, status: "active" },
    });
    if (existingAuction) return apiError("Player is already listed on the market");

    const refund = instantSellRefund(entry.purchasePrice);
    const listingEndsAt = getMarketWindowEnd();

    const updatedUser = await prisma.$transaction(async (tx) => {
      await tx.squadPlayer.delete({ where: { id: entry.id } });

      await tx.player.update({
        where: { id: entry.playerId },
        data: { status: "available", listingEndsAt },
      });

      return tx.user.update({
        where: { id: session.userId },
        data: { budget: { increment: refund } },
        select: { id: true, budget: true, teamName: true },
      });
    });

    await notifyBudgetUpdated(code, {
      userId: session.userId,
      budget: updatedUser.budget,
      reason: "instant_sell",
    });
    await emitToRoom(code, "squad:updated", { userId: session.userId });
    await emitToRoom(code, "market:updated", {
      reason: "instant_sell",
      playerId: entry.playerId,
      playerName: entry.player.name,
    });

    return apiSuccess({
      playerId: entry.playerId,
      playerName: entry.player.name,
      purchasePrice: entry.purchasePrice,
      refund,
      budget: updatedUser.budget,
      message: `Instant sold ${entry.player.name} for ${refund / 1_000_000}M (50% of purchase price).`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Instant sell error:", err);
    return apiError("Failed to instant sell player", 500);
  }
}
