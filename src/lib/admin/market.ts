import { prisma } from "@/lib/prisma";
import { closeAuction } from "@/lib/auction/close";
import { emitToRoom } from "@/lib/socket-emit";

/** Force-close every active auction in a room (highest bid wins / cancel if none) */
export async function forceCloseAllAuctions(roomId: string, roomCode: string) {
  const active = await prisma.auction.findMany({
    where: { roomId, status: "active" },
    select: { id: true },
  });

  const results = [];
  for (const a of active) {
    const result = await closeAuction(a.id);
    if (!result) continue;
    results.push(result);
    await emitToRoom(roomCode, "auction:closed", result);
    if (result.winnerId) {
      await emitToRoom(roomCode, "squad:updated", { userId: result.winnerId });
    }
    if (result.sellerId) {
      await emitToRoom(roomCode, "squad:updated", { userId: result.sellerId });
    }
  }
  return results;
}

/** Lock the transfer window to now (or a given date) */
export async function lockTransferWindow(roomId: string, at = new Date()) {
  await prisma.roomSettings.upsert({
    where: { roomId },
    create: { roomId, transferWindowEndsAt: at },
    update: { transferWindowEndsAt: at },
  });
}

/** Reopen the transfer window (clear hard close) */
export async function unlockTransferWindow(roomId: string) {
  await prisma.roomSettings.upsert({
    where: { roomId },
    create: { roomId, transferWindowEndsAt: null },
    update: { transferWindowEndsAt: null },
  });
}
