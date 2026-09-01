import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MAX_STARTERS } from "@/lib/auction/constants";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const schema = z.object({
  squadPlayerId: z.string(),
  isStarting: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const body = await request.json();
    const { squadPlayerId, isStarting } = schema.parse(body);

    const entry = await prisma.squadPlayer.findFirst({
      where: { id: squadPlayerId, userId: session.userId },
      include: { player: true },
    });

    if (!entry) return apiError("Player not in your squad");

    if (isStarting && !entry.isStarting) {
      const starterCount = await prisma.squadPlayer.count({
        where: { userId: session.userId, isStarting: true },
      });
      if (starterCount >= MAX_STARTERS) {
        return apiError(`Already have ${MAX_STARTERS} starters. Bench someone first.`);
      }
    }

    const updated = await prisma.squadPlayer.update({
      where: { id: squadPlayerId },
      data: { isStarting },
      include: { player: true },
    });

    await emitToRoom(code, "squad:updated", { userId: session.userId });

    return apiSuccess({
      squadPlayer: {
        id: updated.id,
        isStarting: updated.isStarting,
        purchasePrice: updated.purchasePrice,
        player: updated.player,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Toggle starter error:", err);
    return apiError("Failed to update starter", 500);
  }
}
