import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  revealOptionA,
  keepOptionA,
  gambleOptionB,
  replaceForIcon,
} from "@/lib/icons/resolve";
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
    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return apiError("User not found", 401);

    const boxes = await prisma.iconBox.findMany({
      where: {
        roomId: room.id,
        userId: session.userId,
        season: room.currentSeason,
        kind: "hero",
      },
      orderBy: { boxNumber: "asc" },
    });

    const playerIds = Array.from(
      new Set(
        boxes.flatMap((b) =>
          [
            b.revealedOptionA ? b.optionAId : null,
            b.revealedOptionB ? b.optionBId : null,
            b.chosenOptionId,
          ].filter(Boolean) as string[]
        )
      )
    );

    const players =
      playerIds.length > 0
        ? await prisma.player.findMany({ where: { id: { in: playerIds } } })
        : [];
    const pmap = Object.fromEntries(players.map((p) => [p.id, p]));

    const squad = await prisma.squadPlayer.findMany({
      where: { userId: session.userId },
      include: { player: true },
      orderBy: { player: { baseRating: "desc" } },
    });

    return apiSuccess({
      room: {
        code: room.code,
        name: room.name,
        phase: room.phase,
        season: room.currentSeason,
      },
      user: {
        id: user.id,
        teamName: user.teamName,
        budget: user.budget,
        isAdmin: user.isAdmin,
      },
      allowOverflow: room.settings?.allowSquadOverflowForIcons ?? false,
      boxes: boxes.map((b) => ({
        id: b.id,
        boxNumber: b.boxNumber,
        status: b.status,
        revealedOptionA: b.revealedOptionA,
        revealedOptionB: b.revealedOptionB,
        optionA: b.revealedOptionA ? pmap[b.optionAId] ?? null : null,
        optionB: b.revealedOptionB ? pmap[b.optionBId] ?? null : null,
        chosen: b.chosenOptionId ? pmap[b.chosenOptionId] ?? null : null,
      })),
      squad: squad.map((s) => ({
        id: s.id,
        isStarting: s.isStarting,
        player: s.player,
      })),
    });
  } catch (err) {
    console.error("Hero boxes GET error:", err);
    return apiError("Failed to load hero boxes", 500);
  }
}

const actionSchema = z.object({
  boxId: z.string(),
  action: z.enum(["open", "keep", "gamble", "replace"]),
  gambleTargetBoxId: z.string().optional(),
  releaseSquadPlayerId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const body = await request.json();
    const data = actionSchema.parse(body);
    const allowOverflow = room.settings?.allowSquadOverflowForIcons ?? false;

    if (data.action === "open") {
      await revealOptionA(data.boxId, session.userId);
    } else if (data.action === "keep") {
      await keepOptionA(data.boxId, session.userId, allowOverflow);
    } else if (data.action === "gamble") {
      if (!data.gambleTargetBoxId) return apiError("Pick a sealed box to gamble on");
      await gambleOptionB(
        data.boxId,
        data.gambleTargetBoxId,
        session.userId,
        allowOverflow
      );
    } else if (data.action === "replace") {
      if (!data.releaseSquadPlayerId) return apiError("Pick a player to release");
      await replaceForIcon({
        boxId: data.boxId,
        userId: session.userId,
        releaseSquadPlayerId: data.releaseSquadPlayerId,
      });
    }

    await emitToRoom(code, "herobox:updated", { userId: session.userId });
    await emitToRoom(code, "squad:updated", { userId: session.userId });

    return apiSuccess({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Hero box action error:", err);
    return apiError(err instanceof Error ? err.message : "Action failed", 500);
  }
}
