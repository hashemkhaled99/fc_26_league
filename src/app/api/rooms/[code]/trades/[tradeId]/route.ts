import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { executeTrade, validateTrade } from "@/lib/trades/engine";
import { isMarketLocked } from "@/lib/auction/close";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const schema = z.object({
  action: z.enum(["accept", "reject", "counter"]),
  // counter fields
  offeredPlayerIds: z.array(z.string()).optional(),
  requestedPlayerIds: z.array(z.string()).optional(),
  cashAdjustment: z.number().int().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string; tradeId: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const trade = await prisma.tradeRequest.findFirst({
      where: { id: params.tradeId, roomId: room.id },
    });
    if (!trade) return apiError("Trade not found");
    if (trade.status !== "pending") return apiError("Trade is no longer pending");

    const body = await request.json();
    const data = schema.parse(body);

    if (data.action === "reject") {
      if (trade.toUserId !== session.userId && trade.fromUserId !== session.userId) {
        return apiError("Not your trade");
      }
      await prisma.tradeRequest.update({
        where: { id: trade.id },
        data: { status: "rejected" },
      });
      await emitToRoom(code, "trade:resolved", {
        tradeId: trade.id,
        status: "rejected",
        fromUserId: trade.fromUserId,
        toUserId: trade.toUserId,
      });
      return apiSuccess({ status: "rejected" });
    }

    if (isMarketLocked(room.settings)) {
      return apiError("Market is locked — trading closed");
    }

    if (data.action === "accept") {
      if (trade.toUserId !== session.userId) {
        return apiError("Only the recipient can accept");
      }

      const check = await validateTrade({
        fromUserId: trade.fromUserId,
        toUserId: trade.toUserId,
        offeredPlayerIds: trade.offeredPlayerIds,
        requestedPlayerIds: trade.requestedPlayerIds,
        cashAdjustment: trade.cashAdjustment,
      });
      if (!check.ok) return apiError(check.reason);

      await executeTrade({
        fromUserId: trade.fromUserId,
        toUserId: trade.toUserId,
        offeredPlayerIds: trade.offeredPlayerIds,
        requestedPlayerIds: trade.requestedPlayerIds,
        cashAdjustment: trade.cashAdjustment,
      });

      await prisma.tradeRequest.update({
        where: { id: trade.id },
        data: { status: "accepted" },
      });

      await emitToRoom(code, "trade:resolved", {
        tradeId: trade.id,
        status: "accepted",
        fromUserId: trade.fromUserId,
        toUserId: trade.toUserId,
      });
      await emitToRoom(code, "squad:updated", { userId: trade.fromUserId });
      await emitToRoom(code, "squad:updated", { userId: trade.toUserId });

      return apiSuccess({ status: "accepted" });
    }

    // counter — recipient sends a new offer the other way
    if (trade.toUserId !== session.userId) {
      return apiError("Only the recipient can counter");
    }

    const offeredPlayerIds = data.offeredPlayerIds ?? [];
    const requestedPlayerIds = data.requestedPlayerIds ?? [];
    const cashAdjustment = data.cashAdjustment ?? 0;

    // Counter is FROM current user (was toUser) TO original fromUser
    const check = await validateTrade({
      fromUserId: session.userId,
      toUserId: trade.fromUserId,
      offeredPlayerIds,
      requestedPlayerIds,
      cashAdjustment,
    });
    if (!check.ok) return apiError(check.reason);

    await prisma.tradeRequest.update({
      where: { id: trade.id },
      data: { status: "countered" },
    });

    const counter = await prisma.tradeRequest.create({
      data: {
        roomId: room.id,
        fromUserId: session.userId,
        toUserId: trade.fromUserId,
        offeredPlayerIds,
        requestedPlayerIds,
        cashAdjustment,
        status: "pending",
      },
    });

    await emitToRoom(code, "trade:resolved", {
      tradeId: trade.id,
      status: "countered",
      fromUserId: trade.fromUserId,
      toUserId: trade.toUserId,
    });
    await emitToRoom(code, "trade:requested", {
      tradeId: counter.id,
      toUserId: trade.fromUserId,
      fromUserId: session.userId,
    });

    return apiSuccess({ status: "countered", tradeId: counter.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Trade action error:", err);
    return apiError(err instanceof Error ? err.message : "Trade action failed", 500);
  }
}
