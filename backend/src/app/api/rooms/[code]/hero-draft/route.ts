import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireRoomAdmin } from "@/lib/admin/auth";
import {
  startHeroDraft,
  heroDraftPlaceBid,
  heroDraftPass,
  forceReleasePlayer,
  forceAdvanceRound,
  openTradeWindow,
  closeTradeWindow,
  completeDraft,
} from "@/lib/hero-draft/engine";
import { computeDraftRecap, type RoundHistoryInput } from "@/lib/hero-draft/deductions";
import { validateTierWeights } from "@/lib/hero-draft/tiers";

type Ctx = { params: { code: string } };

async function requireDraftMember(code: string) {
  const session = await getSession();
  if (!session.userId) return { ok: false as const, response: apiError("Not authenticated", 401) };
  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      heroDraftState: true,
      heroDraftSettings: true,
      users: { select: { id: true, displayName: true, teamName: true, budget: true, isAdmin: true } },
    },
  });
  if (!room) return { ok: false as const, response: apiError("Room not found") };
  if (room.mode !== "HERO_DRAFT") {
    return { ok: false as const, response: apiError("Not a Hero Draft room") };
  }
  if (room.id !== session.roomId) {
    return { ok: false as const, response: apiError("Wrong room") };
  }
  return { ok: true as const, session, room };
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireDraftMember(params.code);
    if (!auth.ok) return auth.response;
    const { room, session } = auth;

    let auctionedPlayer = null;
    if (room.heroDraftState?.currentAuctionedPlayerId) {
      auctionedPlayer = await prisma.player.findUnique({
        where: { id: room.heroDraftState.currentAuctionedPlayerId },
      });
    }

    const squad = await prisma.squadPlayer.findMany({
      where: { userId: session.userId! },
      include: { player: true },
      orderBy: { draftSlotIndex: "asc" },
    });

    return apiSuccess({
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        mode: room.mode,
        phase: room.phase,
      },
      settings: room.heroDraftSettings,
      state: room.heroDraftState,
      users: room.users,
      auctionedPlayer,
      mySquad: squad,
      me: room.users.find((u) => u.id === session.userId),
    });
  } catch (err) {
    console.error("Hero draft GET error:", err);
    return apiError("Failed to load draft", 500);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("bid"), amount: z.number().int().positive() }),
  z.object({ action: z.literal("pass") }),
  z.object({ action: z.literal("release"), squadPlayerId: z.string().min(1) }),
  z.object({ action: z.literal("force_advance") }),
  z.object({ action: z.literal("open_trade_window") }),
  z.object({ action: z.literal("close_trade_window") }),
  z.object({ action: z.literal("skip_to_recap") }),
  z.object({ action: z.literal("show_recap") }),
]);

export async function POST(request: Request, { params }: Ctx) {
  try {
    const body = await request.json();
    const data = actionSchema.parse(body);

    if (
      data.action === "start" ||
      data.action === "force_advance" ||
      data.action === "open_trade_window" ||
      data.action === "close_trade_window" ||
      data.action === "skip_to_recap"
    ) {
      const admin = await requireRoomAdmin(params.code);
      if (!admin.ok) return admin.response;
    }

    const auth = await requireDraftMember(params.code);
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId!;

    switch (data.action) {
      case "start":
        await startHeroDraft(params.code);
        return apiSuccess({ ok: true });
      case "bid":
        return apiSuccess(await heroDraftPlaceBid(params.code, userId, data.amount));
      case "pass":
        return apiSuccess(await heroDraftPass(params.code, userId, false));
      case "release":
        return apiSuccess(
          await forceReleasePlayer(params.code, userId, data.squadPlayerId)
        );
      case "force_advance":
        return apiSuccess(await forceAdvanceRound(params.code));
      case "open_trade_window":
        await openTradeWindow(params.code);
        return apiSuccess({ ok: true });
      case "close_trade_window":
        await closeTradeWindow(params.code);
        return apiSuccess({ ok: true });
      case "skip_to_recap": {
        // Force complete without trade window
        const room = auth.room;
        await prisma.heroDraftSettings.update({
          where: { roomId: room.id },
          data: { tradeWindowEnabled: false },
        });
        await completeDraft(params.code);
        return apiSuccess({ ok: true });
      }
      case "show_recap": {
        const history = await prisma.draftRoundHistory.findMany({
          where: { roomId: auth.room.id },
          orderBy: { roundIndex: "asc" },
        });
        const players = await prisma.player.findMany({
          where: { roomId: auth.room.id },
          select: { id: true, baseRating: true },
        });
        const ratingById = new Map(players.map((p) => [p.id, p.baseRating]));
        const inputs: RoundHistoryInput[] = history.map((h) => ({
          winnerId: h.winnerId,
          winningBid: h.winningBid,
          auctionedPlayerId: h.auctionedPlayerId,
          auctionedPlayerRating: ratingById.get(h.auctionedPlayerId) ?? 0,
          randomRolls: (
            h.randomRolls as Array<{ userId: string; playerId: string; rating: number }>
          ).map((r) => ({
            userId: r.userId,
            playerId: r.playerId,
            rating: r.rating ?? ratingById.get(r.playerId) ?? 0,
          })),
        }));
        return apiSuccess({
          recap: computeDraftRecap(inputs),
          users: auth.room.users,
          history,
        });
      }
      default:
        return apiError("Unknown action");
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Hero draft action error:", err);
    return apiError(err instanceof Error ? err.message : "Action failed", 400);
  }
}

const settingsSchema = z.object({
  startingBudget: z.number().int().positive().optional(),
  bidTimerSeconds: z.number().int().positive().optional(),
  tierWeightGold: z.number().int().min(0).max(100).optional(),
  tierWeightHero: z.number().int().min(0).max(100).optional(),
  tierWeightIcon: z.number().int().min(0).max(100).optional(),
  goldenRoundMinRating: z.number().int().min(1).max(99).optional(),
  minPlayerRating: z.number().int().min(1).max(99).optional(),
  turnHolderMustOpenBid: z.boolean().optional(),
  bidTurnTimeoutSeconds: z.number().int().positive().optional(),
  passiveDeductionRatio: z.number().min(0).max(1).optional(),
  tradeWindowMinutes: z.number().int().positive().optional(),
  tradeWindowEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const admin = await requireRoomAdmin(params.code);
    if (!admin.ok) return admin.response;
    if (admin.room.mode !== "HERO_DRAFT") {
      return apiError("Not a Hero Draft room");
    }

    const data = settingsSchema.parse(await request.json());
    const existing = await prisma.heroDraftSettings.findUnique({
      where: { roomId: admin.room.id },
    });
    if (!existing) return apiError("Hero Draft settings missing");

    const nextWeights = {
      GOLD: data.tierWeightGold ?? existing.tierWeightGold,
      HERO: data.tierWeightHero ?? existing.tierWeightHero,
      ICON: data.tierWeightIcon ?? existing.tierWeightIcon,
    };
    const weightError = validateTierWeights(nextWeights);
    if (weightError) return apiError(weightError);

    const updated = await prisma.heroDraftSettings.update({
      where: { roomId: admin.room.id },
      data: {
        ...data,
        tierWeightGold: nextWeights.GOLD,
        tierWeightHero: nextWeights.HERO,
        tierWeightIcon: nextWeights.ICON,
      },
    });

    // Keep live state weights in sync if draft not started
    await prisma.heroDraftState.updateMany({
      where: { roomId: admin.room.id, status: "not_started" },
      data: {
        tierWeights: nextWeights,
        minPlayerRating: updated.minPlayerRating,
        goldenRoundMinRating: updated.goldenRoundMinRating,
      },
    });

    return apiSuccess({ settings: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Hero draft settings error:", err);
    return apiError("Failed to update settings", 500);
  }
}
