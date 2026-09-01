import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socket-emit";

export async function setRoomUserBudget(roomId: string, userId: string, budget: number) {
  const result = await prisma.user.updateMany({
    where: { id: userId, roomId },
    data: { budget },
  });
  return result.count > 0;
}

export async function setAllRoomUserBudgets(roomId: string, budget: number) {
  return prisma.user.updateMany({
    where: { roomId },
    data: { budget },
  });
}

export async function notifyBudgetUpdated(
  roomCode: string,
  payload: { userId?: string; budget?: number; reason?: string } = {}
) {
  await emitToRoom(roomCode, "budget:updated", payload);
  await emitToRoom(roomCode, "lobby:updated", {});
}
