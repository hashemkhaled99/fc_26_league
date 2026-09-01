import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api";

/** Squad of another user in the room — for building trade offers */
export async function GET(
  _request: Request,
  { params }: { params: { code: string; userId: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const user = await prisma.user.findFirst({
      where: { id: params.userId, roomId: room.id },
      select: { id: true, displayName: true, teamName: true, budget: true },
    });
    if (!user) return apiError("User not found");

    const squad = await prisma.squadPlayer.findMany({
      where: { userId: user.id },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            baseRating: true,
            boostedRating: true,
            boostedStats: true,
            realTeam: true,
          },
        },
      },
      orderBy: { player: { baseRating: "desc" } },
    });

    return apiSuccess({
      user,
      squad: squad.map((s) => ({
        squadPlayerId: s.id,
        purchasePrice: s.purchasePrice,
        ...s.player,
      })),
    });
  } catch (err) {
    console.error("Partner squad error:", err);
    return apiError("Failed to load squad", 500);
  }
}
