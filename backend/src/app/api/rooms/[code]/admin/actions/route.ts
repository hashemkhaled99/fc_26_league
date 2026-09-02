import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomAdmin } from "@/lib/admin/auth";
import {
  forceCloseAllAuctions,
  lockTransferWindow,
  unlockTransferWindow,
} from "@/lib/admin/market";
import { returnAllPlayersToMarket, forceMarketDeadline } from "@/lib/auction/close";
import { notifyBudgetUpdated, setRoomUserBudget } from "@/lib/admin/users";
import { applyBotBoost } from "@/lib/league/botBoost";
import { generateIconBoxes, generateHeroBoxes, iconBoxProgress, heroBoxProgress } from "@/lib/icons/generate";
import { generateFixtures, applyMatchStreaks } from "@/lib/league/fixtures";
import { distributeTransferCards, distributeFixtureCards } from "@/lib/cards/distribute";
import { endSeason, startNewSeason } from "@/lib/season/lifecycle";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const schema = z.object({
  action: z.enum([
    "force_close_market",
    "open_market",
    "extend_deadline",
    "enable_rebid_round",
    "disable_rebid_round",
    "return_all_to_market",
    "force_deadline_930",
    "complete_squads",
    "generate_icon_boxes",
    "generate_hero_boxes",
    "start_league",
    "resolve_match",
    "distribute_cards",
    "distribute_fixture_cards",
    "end_season",
    "start_new_season",
    "kick_user",
    "reset_pin",
    "promote_admin",
    "set_user_budget",
  ]),
  minutes: z.number().int().min(1).max(240).optional(),
  userId: z.string().optional(),
  budget: z.number().int().min(0).optional(),
  matchId: z.string().optional(),
  homeScore: z.number().int().min(0).max(99).optional(),
  awayScore: z.number().int().min(0).max(99).optional(),
  doubleRound: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const auth = await requireRoomAdmin(params.code);
    if (!auth.ok) return auth.response;
    const { room, user: admin } = auth;

    const body = await request.json();
    const data = schema.parse(body);

    if (data.action === "force_close_market") {
      await lockTransferWindow(room.id);
      await prisma.roomSettings.updateMany({
        where: { roomId: room.id },
        data: { rebidRoundEnabled: false },
      });
      const closed = await forceCloseAllAuctions(room.id, room.code);
      await emitToRoom(room.code, "market:locked", { reason: "force_close" });
      await emitToRoom(room.code, "settings:updated", {
        transferWindowEndsAt: new Date().toISOString(),
        rebidRoundEnabled: false,
        marketLocked: true,
      });
      return apiSuccess({ closed: closed.length });
    }

    if (data.action === "open_market") {
      if (room.phase !== "bidding") {
        return apiError("Market can only be opened during the bidding phase");
      }
      await unlockTransferWindow(room.id);
      await prisma.roomSettings.updateMany({
        where: { roomId: room.id },
        data: { rebidRoundEnabled: false },
      });
      await emitToRoom(room.code, "settings:updated", {
        transferWindowEndsAt: null,
        rebidRoundEnabled: false,
      });
      return apiSuccess({
        transferWindowEndsAt: null,
        message: "Transfer window reopened.",
      });
    }

    if (data.action === "extend_deadline") {
      const minutes = data.minutes ?? 15;
      const settings = room.settings;
      const currentEnd = settings?.transferWindowEndsAt ?? new Date();
      const base = currentEnd > new Date() ? currentEnd : new Date();
      const next = new Date(base.getTime() + minutes * 60_000);

      await prisma.roomSettings.upsert({
        where: { roomId: room.id },
        create: { roomId: room.id, transferWindowEndsAt: next },
        update: {
          transferWindowEndsAt: next,
          deadlineEndsAt: settings?.deadlineEndsAt
            ? new Date(Math.max(settings.deadlineEndsAt.getTime(), next.getTime()))
            : next,
        },
      });

      await emitToRoom(room.code, "settings:updated", {
        transferWindowEndsAt: next.toISOString(),
      });
      return apiSuccess({ transferWindowEndsAt: next.toISOString() });
    }

    if (data.action === "enable_rebid_round") {
      if (room.phase !== "bidding") {
        return apiError("Rebid round is only available during the bidding phase");
      }

      const unbidCount = await prisma.player.count({
        where: {
          roomId: room.id,
          status: "available",
          isIcon: false,
          isHero: false,
          auctions: { none: {} },
        },
      });

      await prisma.roomSettings.upsert({
        where: { roomId: room.id },
        create: { roomId: room.id, rebidRoundEnabled: true, transferWindowEndsAt: null },
        update: { rebidRoundEnabled: true, transferWindowEndsAt: null },
      });

      await emitToRoom(room.code, "settings:updated", {
        rebidRoundEnabled: true,
        transferWindowEndsAt: null,
        marketLocked: false,
      });

      return apiSuccess({
        rebidRoundEnabled: true,
        unbidPlayers: unbidCount,
        message: `Rebid round enabled. ${unbidCount} un-bid players can be auctioned with a 2-minute timer.`,
      });
    }

    if (data.action === "disable_rebid_round") {
      await lockTransferWindow(room.id);
      await prisma.roomSettings.updateMany({
        where: { roomId: room.id },
        data: { rebidRoundEnabled: false },
      });

      const lockedAt = new Date();
      await emitToRoom(room.code, "settings:updated", {
        rebidRoundEnabled: false,
        transferWindowEndsAt: lockedAt.toISOString(),
        marketLocked: true,
      });
      await emitToRoom(room.code, "market:locked", { reason: "rebid_round_ended" });

      return apiSuccess({
        rebidRoundEnabled: false,
        message: "Rebid round closed. Market is locked.",
      });
    }

    if (data.action === "return_all_to_market") {
      if (room.phase !== "bidding") {
        return apiError("Only available during the bidding phase");
      }
      const result = await returnAllPlayersToMarket(room.id);
      await emitToRoom(room.code, "settings:updated", {
        transferWindowEndsAt: result.marketDeadline,
        rebidRoundEnabled: false,
        marketLocked: false,
        marketDeadlineAt: result.marketDeadline,
      });
      await emitToRoom(room.code, "market:updated", { reason: "return_all_to_market" });
      await emitToRoom(room.code, "lobby:updated", {});
      return apiSuccess({
        ...result,
        message: `Returned ${result.releasedPlayers} players to market (refunded ${Math.round(result.refundedBudget / 1_000_000)}M). Deadline set to 9:45 PM. Cancelled ${result.cancelledAuctions} auctions.`,
      });
    }

    if (data.action === "force_deadline_930") {
      if (room.phase !== "bidding") {
        return apiError("Only available during the bidding phase");
      }
      const result = await forceMarketDeadline(room.id);
      await emitToRoom(room.code, "settings:updated", {
        transferWindowEndsAt: result.marketDeadline,
        marketDeadlineAt: result.marketDeadline,
        rebidRoundEnabled: false,
        marketLocked: false,
      });
      await emitToRoom(room.code, "market:updated", { reason: "force_deadline_930" });
      return apiSuccess({
        ...result,
        message: `Synced ${result.listings} listings and ${result.auctions} live auctions to 9:45 PM.`,
      });
    }

    if (data.action === "complete_squads") {
      await lockTransferWindow(room.id);
      const closed = await forceCloseAllAuctions(room.id, room.code);
      const boosts = await applyBotBoost(room.id);

      await emitToRoom(room.code, "market:locked", { reason: "complete_squads" });
      await emitToRoom(room.code, "settings:updated", {
        transferWindowEndsAt: new Date().toISOString(),
      });
      await emitToRoom(room.code, "boost:applied", { boosts });

      const boostedCount = boosts.reduce((n, b) => n + b.boosted.length, 0);
      return apiSuccess({
        closed: closed.length,
        boostedPlayers: boostedCount,
        boosts,
        message: `Market locked. Bot boosted ${boostedCount} players across the room.`,
      });
    }

    if (data.action === "generate_icon_boxes") {
      const result = await generateIconBoxes(room.id, room.currentSeason);
      await emitToRoom(room.code, "iconbox:generated", result);
      return apiSuccess({
        ...result,
        message: `Generated ${result.boxes} icon boxes for ${result.users} users.`,
      });
    }

    if (data.action === "generate_hero_boxes") {
      const result = await generateHeroBoxes(room.id, room.currentSeason);
      await emitToRoom(room.code, "herobox:generated", result);
      return apiSuccess({
        ...result,
        message: `Generated ${result.boxes} hero boxes for ${result.users} users.`,
      });
    }

    if (data.action === "start_league") {
      const icons = await iconBoxProgress(room.id, room.currentSeason);
      if (icons.generated && !icons.allReady) {
        return apiError(
          "All users must finish their 4 icon boxes (including squad replacements) first"
        );
      }
      const heroes = await heroBoxProgress(room.id, room.currentSeason);
      if (heroes.generated && !heroes.allReady) {
        return apiError(
          "All users must finish their 4 hero boxes (including squad replacements) first"
        );
      }

      await lockTransferWindow(room.id);
      await forceCloseAllAuctions(room.id, room.code);

      const fixtures = await generateFixtures(
        room.id,
        room.currentSeason,
        data.doubleRound ?? false
      );

      await prisma.room.update({
        where: { id: room.id },
        data: { phase: "league" },
      });

      const fixtureCards = await distributeFixtureCards(room.id, 3);

      await emitToRoom(room.code, "phase:changed", { phase: "league" });
      await emitToRoom(room.code, "league:started", fixtures);
      await emitToRoom(room.code, "cards:dealt", {
        cardsEach: 3,
        category: "fixture",
      });

      return apiSuccess({
        ...fixtures,
        fixtureCards,
        message: `League started with ${fixtures.matches} fixtures. Each manager got 3 fixture cards.`,
      });
    }

    if (data.action === "distribute_cards") {
      if (room.phase !== "bidding") {
        return apiError("Transfer cards can only be dealt during the market");
      }
      const dealt = await distributeTransferCards(room.id, 2);
      await emitToRoom(room.code, "cards:dealt", { cardsEach: 2, category: "transfer" });
      return apiSuccess({
        ...dealt,
        message: `Dealt 2 transfer cards to each of ${dealt.dealt} managers.`,
      });
    }

    if (data.action === "distribute_fixture_cards") {
      if (room.phase !== "league") {
        return apiError("Fixture cards are for the league phase");
      }
      // Force redeal: clear unused fixture then deal
      await prisma.card.deleteMany({
        where: { roomId: room.id, category: "fixture", used: false },
      });
      const dealt = await distributeFixtureCards(room.id, 3);
      await emitToRoom(room.code, "cards:dealt", { cardsEach: 3, category: "fixture" });
      return apiSuccess({
        ...dealt,
        message: `Dealt 3 fixture cards to each manager.`,
      });
    }

    if (data.action === "resolve_match") {
      if (!data.matchId || data.homeScore == null || data.awayScore == null) {
        return apiError("matchId and scores required");
      }
      const match = await prisma.match.findFirst({
        where: { id: data.matchId, roomId: room.id },
      });
      if (!match) return apiError("Match not found");

      await prisma.match.update({
        where: { id: match.id },
        data: {
          homeScore: data.homeScore,
          awayScore: data.awayScore,
          status: "confirmed",
          confirmedById: admin.id,
          reportedById: match.reportedById ?? admin.id,
        },
      });

      await applyMatchStreaks({
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId,
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        roomId: room.id,
      });

      await emitToRoom(room.code, "match:updated", {
        matchId: match.id,
        status: "confirmed",
      });
      return apiSuccess({ status: "confirmed" });
    }

    if (data.action === "end_season") {
      if (room.phase !== "league") return apiError("Must be in league phase");
      const result = await endSeason(room.id, room.code);
      await emitToRoom(room.code, "phase:changed", { phase: "season_end" });
      await emitToRoom(room.code, "awards:ready", { season: result.season });
      return apiSuccess({
        ...result,
        message: `Season ${result.season} ended. ${result.awards.length} awards · prizes paid.`,
      });
    }

    if (data.action === "start_new_season") {
      const result = await startNewSeason(room.id, room.code);
      await emitToRoom(room.code, "phase:changed", { phase: "bidding" });
      await emitToRoom(room.code, "cards:dealt", { cardsEach: 2 });
      await emitToRoom(room.code, "settings:updated", { marketLocked: false });
      return apiSuccess({
        ...result,
        message: `Season ${result.season} transfer window is open. Squads kept, 2 new cards dealt.`,
      });
    }

    if (data.action === "kick_user") {
      if (!data.userId) return apiError("userId required");
      if (data.userId === admin.id) return apiError("Cannot kick yourself");
      const target = await prisma.user.findFirst({
        where: { id: data.userId, roomId: room.id },
      });
      if (!target) return apiError("User not found");
      if (target.isAdmin) return apiError("Cannot kick another admin");

      await prisma.user.delete({ where: { id: target.id } });
      await emitToRoom(room.code, "lobby:updated", {});
      return apiSuccess({ kicked: target.id });
    }

    if (data.action === "reset_pin") {
      if (!data.userId) return apiError("userId required");
      await prisma.user.updateMany({
        where: { id: data.userId, roomId: room.id },
        data: { pin: null },
      });
      return apiSuccess({ ok: true });
    }

    if (data.action === "promote_admin") {
      if (!data.userId) return apiError("userId required");
      await prisma.user.updateMany({
        where: { id: data.userId, roomId: room.id },
        data: { isAdmin: true },
      });
      await emitToRoom(room.code, "lobby:updated", {});
      return apiSuccess({ ok: true });
    }

    if (data.action === "set_user_budget") {
      if (!data.userId || data.budget === undefined) {
        return apiError("userId and budget required");
      }
      const target = await prisma.user.findFirst({
        where: { id: data.userId, roomId: room.id },
      });
      if (!target) return apiError("User not found");

      const ok = await setRoomUserBudget(room.id, data.userId, data.budget);
      if (!ok) return apiError("Failed to update budget");

      await notifyBudgetUpdated(room.code, {
        userId: data.userId,
        budget: data.budget,
        reason: "admin_set",
      });

      return apiSuccess({
        userId: data.userId,
        budget: data.budget,
        message: `Budget set to ${data.budget / 1_000_000}M for ${target.teamName}`,
      });
    }

    return apiError("Unknown action");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Admin action error:", err);
    return apiError(err instanceof Error ? err.message : "Admin action failed", 500);
  }
}
