import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { seedPlayersForRoom } from "@/lib/players/seed";
import { distributeTransferCards } from "@/lib/cards/distribute";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const session = await getSession();
  if (!session.userId) return apiError("Not authenticated", 401);

  const code = params.code.toUpperCase();
  const room = await prisma.room.findUnique({
    where: { code },
    include: { settings: true },
  });

  if (!room) return apiError("Room not found");
  if (room.id !== session.roomId) return apiError("Wrong room");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.isAdmin) return apiError("Admin only");

  if (room.phase !== "lobby") {
    return apiError("Room is not in lobby phase");
  }

  const playerCount = await seedPlayersForRoom(room.id);

  await prisma.room.update({
    where: { id: room.id },
    data: { phase: "bidding" },
  });

  const cards = await distributeTransferCards(room.id, 2);

  await emitToRoom(code, "phase:changed", { phase: "bidding" });
  await emitToRoom(code, "lobby:updated", {});
  await emitToRoom(code, "cards:dealt", { cardsEach: 2 });

  return apiSuccess({
    phase: "bidding",
    playersSeeded: playerCount,
    cardsDealt: cards,
  });
}
