import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AWARD_DEFS } from "@/lib/awards/engine";
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

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return apiError("User not found", 401);

    const season = room.currentSeason;
    const awards = await prisma.award.findMany({
      where: { roomId: room.id, season },
    });

    const users = await prisma.user.findMany({
      where: { roomId: room.id },
      select: { id: true, teamName: true, displayName: true },
    });
    const umap = Object.fromEntries(users.map((u) => [u.id, u]));

    const ordered = AWARD_DEFS.map((def) => {
      const row = awards.find((a) => a.type === def.type);
      if (!row) return null;
      return {
        type: def.type,
        title: def.title,
        emoji: def.emoji,
        blurb: def.blurb,
        userId: row.userId,
        teamName: umap[row.userId]?.teamName ?? "Unknown",
        displayName: umap[row.userId]?.displayName ?? "",
        value: row.value,
        isYou: row.userId === session.userId,
      };
    }).filter(Boolean);

    return apiSuccess({
      room: {
        code: room.code,
        name: room.name,
        phase: room.phase,
        season,
      },
      user: {
        id: user.id,
        teamName: user.teamName,
        budget: user.budget,
        isAdmin: user.isAdmin,
      },
      awards: ordered,
    });
  } catch (err) {
    console.error("Awards GET error:", err);
    return apiError("Failed to load awards", 500);
  }
}
