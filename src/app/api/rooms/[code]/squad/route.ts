import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MAX_STARTERS, SQUAD_LIMIT } from "@/lib/auction/constants";
import { apiError, apiSuccess } from "@/lib/api";
import { ensureBoostedStats, parseBoostedStats } from "@/lib/players/faceStats";

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

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return apiError("User not found", 401);

    const squad = await prisma.squadPlayer.findMany({
      where: { userId: session.userId },
      include: { player: true },
      orderBy: [{ isStarting: "desc" }, { player: { baseRating: "desc" } }],
    });

    // Backfill face stats for players who only have OVR boost (legacy / failed write)
    const enriched = await Promise.all(
      squad.map(async (s) => {
        const player = s.player;
        const hasOvrBoost =
          player.boostedRating != null && player.boostedRating > player.baseRating;
        const existing = parseBoostedStats(player.boostedStats);
        if (!hasOvrBoost || existing.length > 0) {
          return {
            ...s,
            player: {
              ...player,
              boostedStats: existing.length > 0 ? existing : player.boostedStats,
            },
          };
        }

        const stats = ensureBoostedStats(
          player.position,
          player.baseRating,
          player.boostedRating,
          player.boostedStats
        );
        if (stats.length === 0) return s;

        try {
          await prisma.player.update({
            where: { id: player.id },
            data: { boostedStats: stats as unknown as Prisma.InputJsonValue },
          });
        } catch {
          /* still return stats to client even if persist fails */
        }

        return {
          ...s,
          player: { ...player, boostedStats: stats },
        };
      })
    );

    const starters = enriched.filter((s) => s.isStarting);
    const bench = enriched.filter((s) => !s.isStarting);

    return apiSuccess({
      room: {
        code: room.code,
        name: room.name,
        phase: room.phase,
      },
      user: {
        id: user.id,
        displayName: user.displayName,
        teamName: user.teamName,
        budget: user.budget,
        isAdmin: user.isAdmin,
      },
      squad: enriched.map((s) => ({
        id: s.id,
        isStarting: s.isStarting,
        purchasePrice: s.purchasePrice,
        player: s.player,
      })),
      starters: starters.map((s) => ({
        id: s.id,
        isStarting: s.isStarting,
        purchasePrice: s.purchasePrice,
        player: s.player,
      })),
      bench: bench.map((s) => ({
        id: s.id,
        isStarting: s.isStarting,
        purchasePrice: s.purchasePrice,
        player: s.player,
      })),
      counts: {
        total: enriched.length,
        starters: starters.length,
        maxStarters: MAX_STARTERS,
        squadLimit: SQUAD_LIMIT,
      },
    });
  } catch (err) {
    console.error("Squad GET error:", err);
    return apiError("Failed to load squad", 500);
  }
}
