import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeStandings, applyMatchStreaks } from "@/lib/league/fixtures";
import { emitToRoom } from "@/lib/socket-emit";
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
    const matches = await prisma.match.findMany({
      where: { roomId: room.id, season },
      include: {
        homeUser: { select: { id: true, teamName: true, displayName: true } },
        awayUser: { select: { id: true, teamName: true, displayName: true } },
      },
      orderBy: { id: "asc" },
    });

    const standings = await computeStandings(room.id, season);

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
      standings,
      matches: matches.map((m) => ({
        id: m.id,
        homeUser: m.homeUser,
        awayUser: m.awayUser,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: m.status,
        reportedById: m.reportedById,
        confirmedById: m.confirmedById,
        canReport:
          m.status === "scheduled" &&
          (m.homeUserId === session.userId || m.awayUserId === session.userId),
        canConfirm:
          m.status === "pending_confirmation" &&
          m.reportedById !== session.userId &&
          (m.homeUserId === session.userId || m.awayUserId === session.userId),
        canDispute:
          m.status === "pending_confirmation" &&
          m.reportedById !== session.userId &&
          (m.homeUserId === session.userId || m.awayUserId === session.userId),
      })),
    });
  } catch (err) {
    console.error("League GET error:", err);
    return apiError("Failed to load league", 500);
  }
}

const schema = z.object({
  matchId: z.string(),
  action: z.enum(["report", "confirm", "dispute"]),
  homeScore: z.number().int().min(0).max(99).optional(),
  awayScore: z.number().int().min(0).max(99).optional(),
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
    if (room.phase !== "league") return apiError("League has not started");

    const body = await request.json();
    const data = schema.parse(body);

    const match = await prisma.match.findFirst({
      where: { id: data.matchId, roomId: room.id },
    });
    if (!match) return apiError("Match not found");

    const isParty =
      match.homeUserId === session.userId || match.awayUserId === session.userId;
    if (!isParty) return apiError("Not your match");

    if (data.action === "report") {
      if (match.status !== "scheduled") return apiError("Match already reported");
      if (data.homeScore == null || data.awayScore == null) {
        return apiError("Scores required");
      }
      await prisma.match.update({
        where: { id: match.id },
        data: {
          homeScore: data.homeScore,
          awayScore: data.awayScore,
          status: "pending_confirmation",
          reportedById: session.userId,
        },
      });
      await emitToRoom(code, "match:updated", { matchId: match.id });
      return apiSuccess({ status: "pending_confirmation" });
    }

    if (data.action === "confirm") {
      if (match.status !== "pending_confirmation") {
        return apiError("Nothing to confirm");
      }
      if (match.reportedById === session.userId) {
        return apiError("Opponent must confirm");
      }
      if (match.homeScore == null || match.awayScore == null) {
        return apiError("Missing scores");
      }

      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "confirmed",
          confirmedById: session.userId,
        },
      });

      const streakPaid = await applyMatchStreaks({
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        roomId: room.id,
      });

      const { applyFixtureCardEffects } = await import("@/lib/cards/fixtureEffects");
      const fixtureFx = await applyFixtureCardEffects({
        id: match.id,
        roomId: room.id,
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      });

      await emitToRoom(code, "match:updated", { matchId: match.id, status: "confirmed" });
      if (streakPaid.length > 0) {
        await emitToRoom(code, "streak:bonus", { bonuses: streakPaid });
      }
      return apiSuccess({
        status: "confirmed",
        streakBonuses: streakPaid,
        fixtureEffects: fixtureFx.notes,
      });
    }

    if (data.action === "dispute") {
      if (match.status !== "pending_confirmation") {
        return apiError("Nothing to dispute");
      }
      if (match.reportedById === session.userId) {
        return apiError("Cannot dispute your own report");
      }
      await prisma.match.update({
        where: { id: match.id },
        data: { status: "disputed" },
      });
      await emitToRoom(code, "match:updated", { matchId: match.id, status: "disputed" });
      return apiSuccess({ status: "disputed" });
    }

    return apiError("Unknown action");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("League action error:", err);
    return apiError(err instanceof Error ? err.message : "Action failed", 500);
  }
}
