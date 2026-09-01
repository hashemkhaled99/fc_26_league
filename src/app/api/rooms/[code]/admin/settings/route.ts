import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomAdmin } from "@/lib/admin/auth";
import {
  notifyBudgetUpdated,
  setAllRoomUserBudgets,
} from "@/lib/admin/users";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";
import { MAX_BID_TIMER_SECONDS } from "@/lib/auction/constants";

const settingsSchema = z.object({
  startingBudget: z.number().int().min(1_000_000).optional(),
  bidTimerSeconds: z.number().int().min(5).max(MAX_BID_TIMER_SECONDS).optional(),
  deadlineBidTimerSeconds: z.number().int().min(5).max(MAX_BID_TIMER_SECONDS).optional(),
  deadlineDayEnabled: z.boolean().optional(),
  deadlineStartsAt: z.string().nullable().optional(),
  deadlineEndsAt: z.string().nullable().optional(),
  transferWindowEndsAt: z.string().nullable().optional(),
  enabledCardTypes: z.array(z.string()).optional(),
  streakBonusEnabled: z.boolean().optional(),
  streakBonusAt3: z.number().int().min(0).optional(),
  streakBonusAt5: z.number().int().min(0).optional(),
  leaguePrizeFirst: z.number().int().min(0).optional(),
  leaguePrizeSecond: z.number().int().min(0).optional(),
  telegramWebhookUrl: z.string().nullable().optional(),
  tradingEnabledDuringLeague: z.boolean().optional(),
  allowSquadOverflowForIcons: z.boolean().optional(),
});

function parseDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function PATCH(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const auth = await requireRoomAdmin(params.code);
    if (!auth.ok) return auth.response;
    const { room } = auth;

    const body = await request.json();
    const data = settingsSchema.parse(body);

    const previousStartingBudget = room.settings?.startingBudget;

    const update: Record<string, unknown> = {};
    if (data.startingBudget !== undefined) update.startingBudget = data.startingBudget;
    if (data.bidTimerSeconds !== undefined) update.bidTimerSeconds = data.bidTimerSeconds;
    if (data.deadlineBidTimerSeconds !== undefined) {
      update.deadlineBidTimerSeconds = data.deadlineBidTimerSeconds;
    }
    if (data.deadlineDayEnabled !== undefined) update.deadlineDayEnabled = data.deadlineDayEnabled;
    if (data.deadlineStartsAt !== undefined) update.deadlineStartsAt = parseDate(data.deadlineStartsAt);
    if (data.deadlineEndsAt !== undefined) update.deadlineEndsAt = parseDate(data.deadlineEndsAt);
    if (data.transferWindowEndsAt !== undefined) {
      update.transferWindowEndsAt = parseDate(data.transferWindowEndsAt);
    }
    if (data.enabledCardTypes !== undefined) update.enabledCardTypes = data.enabledCardTypes;
    if (data.streakBonusEnabled !== undefined) update.streakBonusEnabled = data.streakBonusEnabled;
    if (data.streakBonusAt3 !== undefined) update.streakBonusAt3 = data.streakBonusAt3;
    if (data.streakBonusAt5 !== undefined) update.streakBonusAt5 = data.streakBonusAt5;
    if (data.leaguePrizeFirst !== undefined) update.leaguePrizeFirst = data.leaguePrizeFirst;
    if (data.leaguePrizeSecond !== undefined) update.leaguePrizeSecond = data.leaguePrizeSecond;
    if (data.telegramWebhookUrl !== undefined) {
      update.telegramWebhookUrl = data.telegramWebhookUrl || null;
    }
    if (data.tradingEnabledDuringLeague !== undefined) {
      update.tradingEnabledDuringLeague = data.tradingEnabledDuringLeague;
    }
    if (data.allowSquadOverflowForIcons !== undefined) {
      update.allowSquadOverflowForIcons = data.allowSquadOverflowForIcons;
    }

    const settings = await prisma.roomSettings.upsert({
      where: { roomId: room.id },
      create: {
        roomId: room.id,
        ...update,
      },
      update,
    });

    if (
      data.startingBudget !== undefined &&
      data.startingBudget !== previousStartingBudget
    ) {
      await setAllRoomUserBudgets(room.id, data.startingBudget);
      await notifyBudgetUpdated(room.code, {
        reason: "starting_budget",
        budget: data.startingBudget,
      });
    }

    await emitToRoom(room.code, "settings:updated", {
      transferWindowEndsAt: settings.transferWindowEndsAt?.toISOString() ?? null,
      deadlineStartsAt: settings.deadlineStartsAt?.toISOString() ?? null,
      deadlineEndsAt: settings.deadlineEndsAt?.toISOString() ?? null,
      deadlineDayEnabled: settings.deadlineDayEnabled,
      bidTimerSeconds: settings.bidTimerSeconds,
      deadlineBidTimerSeconds: settings.deadlineBidTimerSeconds,
    });

    return apiSuccess({
      settings: {
        ...settings,
        deadlineStartsAt: settings.deadlineStartsAt?.toISOString() ?? null,
        deadlineEndsAt: settings.deadlineEndsAt?.toISOString() ?? null,
        transferWindowEndsAt: settings.transferWindowEndsAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid settings");
    }
    console.error("Admin settings error:", err);
    return apiError("Failed to save settings", 500);
  }
}
