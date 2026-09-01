import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SQUAD_LIMIT } from "@/lib/auction/constants";
import { iconBoxProgress, heroBoxProgress } from "@/lib/icons/generate";
import { requireRoomAdmin } from "@/lib/admin/auth";
import { apiError, apiSuccess } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const auth = await requireRoomAdmin(params.code);
    if (!auth.ok) return auth.response;
    const { room, user } = auth;

    const users = await prisma.user.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayName: true,
        teamName: true,
        budget: true,
        isAdmin: true,
        pin: true,
        _count: { select: { squadPlayers: true } },
      },
    });

    const activeAuctions = await prisma.auction.count({
      where: { roomId: room.id, status: "active" },
    });

    const iconProgress = await iconBoxProgress(room.id, room.currentSeason);
    const heroProgress = await heroBoxProgress(room.id, room.currentSeason);

    const disputedMatches = await prisma.match.findMany({
      where: { roomId: room.id, season: room.currentSeason, status: "disputed" },
      include: {
        homeUser: { select: { id: true, teamName: true } },
        awayUser: { select: { id: true, teamName: true } },
      },
    });

    const settings = room.settings
      ? {
          ...room.settings,
          deadlineStartsAt: room.settings.deadlineStartsAt?.toISOString() ?? null,
          deadlineEndsAt: room.settings.deadlineEndsAt?.toISOString() ?? null,
          transferWindowEndsAt: room.settings.transferWindowEndsAt?.toISOString() ?? null,
        }
      : null;

    return apiSuccess({
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        phase: room.phase,
        currentSeason: room.currentSeason,
      },
      settings,
      activeAuctions,
      iconProgress,
      heroProgress,
      disputedMatches: disputedMatches.map((m) => ({
        id: m.id,
        homeTeam: m.homeUser.teamName,
        awayTeam: m.awayUser.teamName,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
      })),
      users: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        teamName: u.teamName,
        budget: u.budget,
        isAdmin: u.isAdmin,
        hasPin: Boolean(u.pin),
        squadCount: u._count.squadPlayers,
        squadLimit: SQUAD_LIMIT,
        squadPct: Math.round((u._count.squadPlayers / SQUAD_LIMIT) * 100),
      })),
      admin: {
        id: user.id,
        teamName: user.teamName,
        budget: user.budget,
      },
    });
  } catch (err) {
    console.error("Admin GET error:", err);
    return apiError("Failed to load admin", 500);
  }
}
