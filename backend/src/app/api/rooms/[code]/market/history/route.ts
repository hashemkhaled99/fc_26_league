import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getMarketHistoryStats } from "@/lib/market/stats";
import { apiError, apiSuccess } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const stats = await getMarketHistoryStats(room.id);

    return apiSuccess({
      room: {
        code: room.code,
        name: room.name,
        phase: room.phase,
        season: room.currentSeason,
      },
      ...stats,
    });
  } catch (err) {
    console.error("Market history error:", err);
    return apiError("Failed to load market history", 500);
  }
}
