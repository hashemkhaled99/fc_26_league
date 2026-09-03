import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api";
import { emitToRoom } from "@/lib/socket-emit";
import {
  defaultTactics,
  monteCarloMatch,
  simulateMatch,
  type Mentality,
  type TeamTactics,
} from "@/lib/league/simulate";
import { SIM_FORMATIONS } from "@/lib/league/simulate-formations";
import { loadSimSquadWithStarters } from "@/lib/league/simulate-squad";
import { projectSeason } from "@/lib/league/simulate-season";

const mentalitySchema = z.enum(["attack", "balanced", "defence"]);
const formationSchema = z.string().min(1).max(32);

const tacticsSchema = z.object({
  formationId: formationSchema.default("433"),
  mentality: mentalitySchema.default("balanced"),
  starterIds: z.array(z.string()).min(1).max(11),
  substitutions: z
    .array(
      z.object({
        outId: z.string(),
        inId: z.string(),
        minute: z.number().int().min(1).max(90),
      })
    )
    .max(5)
    .optional(),
  halfTimeMentality: mentalitySchema.optional(),
  halfTimeFormationId: formationSchema.optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setup"),
    matchId: z.string().min(1),
  }),
  z.object({
    action: z.literal("lock"),
    matchId: z.string().min(1),
    tactics: tacticsSchema,
  }),
  z.object({
    action: z.literal("unlock"),
    matchId: z.string().min(1),
  }),
  z.object({
    action: z.literal("preview"),
    matchId: z.string().min(1),
    seed: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("odds"),
    matchId: z.string().min(1),
    runs: z.number().int().min(50).max(5000).optional(),
  }),
  z.object({
    action: z.literal("apply"),
    matchId: z.string().min(1),
    seed: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("season_projection"),
    runs: z.number().int().min(50).max(3000).optional(),
  }),
]);

function parseTactics(raw: unknown, fallbackStarterIds: string[]): TeamTactics | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = tacticsSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    formationId: parsed.data.formationId,
    mentality: parsed.data.mentality,
    starterIds:
      parsed.data.starterIds.length > 0 ? parsed.data.starterIds : fallbackStarterIds,
    substitutions: parsed.data.substitutions ?? [],
    halfTimeMentality: parsed.data.halfTimeMentality,
    halfTimeFormationId: parsed.data.halfTimeFormationId,
  };
}

function toJsonTactics(t: TeamTactics): Prisma.InputJsonValue {
  return {
    formationId: t.formationId,
    mentality: t.mentality,
    starterIds: t.starterIds,
    substitutions: t.substitutions ?? [],
    halfTimeMentality: t.halfTimeMentality ?? null,
    halfTimeFormationId: t.halfTimeFormationId ?? null,
  };
}

function mergeDefaults(
  locked: TeamTactics | null,
  fallbackStarterIds: string[],
  players: { id: string; rating: number; position: string }[]
): TeamTactics {
  if (locked) return locked;
  return {
    ...defaultTactics(players as never),
    starterIds: fallbackStarterIds,
  };
}

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

    return apiSuccess({
      formations: SIM_FORMATIONS.map((f) => ({
        id: f.id,
        name: f.name,
        atkBias: f.atkBias,
        defBias: f.defBias,
      })),
      mentalities: [
        { id: "attack", label: "Attack", hint: "More chances both ways" },
        { id: "balanced", label: "Balanced", hint: "Default" },
        { id: "defence", label: "Defence", hint: "Fewer goals, solid shape" },
      ],
      maxSubs: 5,
    });
  } catch (err) {
    console.error("Sim GET error:", err);
    return apiError("Failed to load sim options", 500);
  }
}

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
    if (room.phase !== "league" && room.phase !== "season_end") {
      return apiError("League has not started");
    }

    const body = bodySchema.parse(await request.json());

    // ——— Season projection (no matchId) ———
    if (body.action === "season_projection") {
      const season = room.currentSeason;
      const matches = await prisma.match.findMany({
        where: { roomId: room.id, season },
        select: {
          homeUserId: true,
          awayUserId: true,
          homeScore: true,
          awayScore: true,
          status: true,
        },
      });

      const users = await prisma.user.findMany({
        where: { roomId: room.id },
        select: { id: true, teamName: true, displayName: true },
      });

      const packs = await Promise.all(
        users.map(async (u) => {
          const pack = await loadSimSquadWithStarters(u.id);
          return { user: u, pack };
        })
      );

      const eligible = packs.filter((p) => p.pack.players.length >= 11);
      if (eligible.length < 2) {
        return apiError("Need at least 2 clubs with 11+ players");
      }

      const teams = eligible.map(({ user, pack }) => ({
        userId: user.id,
        teamName: user.teamName,
        displayName: user.displayName,
        players: pack.players,
        tactics: {
          ...defaultTactics(pack.players),
          starterIds: pack.starterIds,
        } as TeamTactics,
      }));

      const confirmed = matches
        .filter(
          (m) =>
            m.status === "confirmed" && m.homeScore != null && m.awayScore != null
        )
        .map((m) => ({
          homeUserId: m.homeUserId,
          awayUserId: m.awayUserId,
          homeScore: m.homeScore!,
          awayScore: m.awayScore!,
        }));

      const remaining = matches
        .filter((m) => m.status === "scheduled")
        .map((m) => ({
          homeUserId: m.homeUserId,
          awayUserId: m.awayUserId,
        }));

      const projection = projectSeason({
        teams,
        confirmed,
        remaining,
        runs: body.runs ?? 500,
      });

      return apiSuccess({ projection });
    }

    const match = await prisma.match.findFirst({
      where: { id: body.matchId, roomId: room.id },
      include: {
        homeUser: { select: { id: true, teamName: true, displayName: true } },
        awayUser: { select: { id: true, teamName: true, displayName: true } },
      },
    });
    if (!match) return apiError("Match not found");

    const isHome = match.homeUserId === session.userId;
    const isAway = match.awayUserId === session.userId;
    const isParty = isHome || isAway;
    const youAre = isHome ? "home" : isAway ? "away" : "spectator";

    const [homePack, awayPack] = await Promise.all([
      loadSimSquadWithStarters(match.homeUserId),
      loadSimSquadWithStarters(match.awayUserId),
    ]);

    if (homePack.players.length < 11 || awayPack.players.length < 11) {
      return apiError("Both teams need at least 11 players to simulate");
    }

    const homeLockedTactics = parseTactics(match.homeSimTactics, homePack.starterIds);
    const awayLockedTactics = parseTactics(match.awaySimTactics, awayPack.starterIds);
    const bothLocked = match.homeSimLocked && match.awaySimLocked;

    if (body.action === "setup") {
      const homeDefault: TeamTactics = homeLockedTactics ?? {
        ...defaultTactics(homePack.players),
        starterIds: homePack.starterIds,
      };
      const awayDefault: TeamTactics = awayLockedTactics ?? {
        ...defaultTactics(awayPack.players),
        starterIds: awayPack.starterIds,
      };

      return apiSuccess({
        match: {
          id: match.id,
          status: match.status,
          homeUser: match.homeUser,
          awayUser: match.awayUser,
        },
        locks: {
          homeLocked: match.homeSimLocked,
          awayLocked: match.awaySimLocked,
          bothLocked,
        },
        home: {
          players: homePack.players,
          defaultTactics: homeDefault,
          lockedTactics: homeLockedTactics,
        },
        away: {
          players: awayPack.players,
          defaultTactics: awayDefault,
          lockedTactics: awayLockedTactics,
        },
        formations: SIM_FORMATIONS.map((f) => ({
          id: f.id,
          name: f.name,
        })),
        youAre,
        simMeta: match.simMeta,
      });
    }

    if (body.action === "lock") {
      if (!isParty) return apiError("Not your match");
      if (match.status !== "scheduled") return apiError("Match already reported");

      const tactics: TeamTactics = {
        formationId: body.tactics.formationId,
        mentality: body.tactics.mentality as Mentality,
        starterIds: body.tactics.starterIds,
        substitutions: body.tactics.substitutions ?? [],
        halfTimeMentality: body.tactics.halfTimeMentality,
        halfTimeFormationId: body.tactics.halfTimeFormationId,
      };

      if (isHome) {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            homeSimTactics: toJsonTactics(tactics),
            homeSimLocked: true,
          },
        });
      } else {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            awaySimTactics: toJsonTactics(tactics),
            awaySimLocked: true,
          },
        });
      }

      const updated = await prisma.match.findUnique({ where: { id: match.id } });
      await emitToRoom(code, "match:sim_lock", {
        matchId: match.id,
        homeLocked: updated?.homeSimLocked ?? false,
        awayLocked: updated?.awaySimLocked ?? false,
      });

      return apiSuccess({
        homeLocked: updated?.homeSimLocked ?? false,
        awayLocked: updated?.awaySimLocked ?? false,
        bothLocked: !!(updated?.homeSimLocked && updated?.awaySimLocked),
        message: "Tactics locked",
      });
    }

    if (body.action === "unlock") {
      if (!isParty) return apiError("Not your match");
      if (match.status !== "scheduled") return apiError("Match already reported");

      if (isHome) {
        await prisma.match.update({
          where: { id: match.id },
          data: { homeSimLocked: false },
        });
      } else {
        await prisma.match.update({
          where: { id: match.id },
          data: { awaySimLocked: false },
        });
      }

      const updated = await prisma.match.findUnique({ where: { id: match.id } });
      await emitToRoom(code, "match:sim_lock", {
        matchId: match.id,
        homeLocked: updated?.homeSimLocked ?? false,
        awayLocked: updated?.awaySimLocked ?? false,
      });

      return apiSuccess({
        homeLocked: updated?.homeSimLocked ?? false,
        awayLocked: updated?.awaySimLocked ?? false,
        bothLocked: false,
        message: "Tactics unlocked — you can edit again",
      });
    }

    // preview / odds / apply require both locks
    if (!bothLocked || !homeLockedTactics || !awayLockedTactics) {
      return apiError("Both managers must lock tactics first");
    }
    if ((body.action === "preview" || body.action === "apply") && !isParty) {
      return apiError("Not your match");
    }

    const homeTactics = mergeDefaults(
      homeLockedTactics,
      homePack.starterIds,
      homePack.players
    );
    const awayTactics = mergeDefaults(
      awayLockedTactics,
      awayPack.starterIds,
      awayPack.players
    );

    const input = {
      home: {
        teamName: match.homeUser.teamName,
        players: homePack.players,
        tactics: homeTactics,
      },
      away: {
        teamName: match.awayUser.teamName,
        players: awayPack.players,
        tactics: awayTactics,
      },
    };

    if (body.action === "odds") {
      const summary = monteCarloMatch(input, body.runs ?? 1000);
      return apiSuccess({ odds: summary });
    }

    if (body.action === "preview") {
      const result = simulateMatch({ ...input, seed: body.seed });
      return apiSuccess({ result });
    }

    // apply
    if (match.status !== "scheduled") {
      return apiError("Match already reported");
    }

    const result = simulateMatch({ ...input, seed: body.seed });

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        status: "pending_confirmation",
        reportedById: session.userId,
        simMeta: {
          potm: result.potm,
          ratings: result.ratings.slice(0, 22),
          homeXg: result.homeXg,
          awayXg: result.awayXg,
        },
      },
    });

    await emitToRoom(code, "match:updated", {
      matchId: match.id,
      status: "pending_confirmation",
      simulated: true,
      potm: result.potm,
    });

    return apiSuccess({
      status: "pending_confirmation",
      result,
      message: "Sim result submitted — opponent must confirm",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Sim POST error:", err);
    return apiError(err instanceof Error ? err.message : "Simulation failed", 500);
  }
}
