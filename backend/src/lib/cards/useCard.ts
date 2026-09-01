import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SQUAD_LIMIT, DEFAULT_STARTING_BID } from "@/lib/auction/constants";
import { getCommittedBudget } from "@/lib/auction/budget";
import { getMarketWindowEnd, nextListingEndsAt } from "@/lib/auction/listings";
import { setAuctionEnd } from "@/lib/timerStore";
import { ensureIconPool } from "@/lib/icons/generate";
import { CARD_BY_KEY, pickWeightedCardKeys, DEFAULT_TRANSFER_CARD_KEYS } from "./types";
import { createEffect, consumeOneShotEffect } from "./effects";

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export interface UseCardInput {
  cardId: string;
  userId: string;
  roomId: string;
  roomCode: string;
  auctionId?: string;
  playerId?: string;
  targetUserId?: string;
  ownPlayerId?: string;
  matchId?: string;
}

export async function useCard(input: UseCardInput) {
  const card = await prisma.card.findFirst({
    where: { id: input.cardId, roomId: input.roomId, ownerId: input.userId, used: false },
  });
  if (!card) throw new Error("Card not found or already used");

  const def = CARD_BY_KEY[card.type];
  if (!def) throw new Error("Unknown card type");

  const room = await prisma.room.findUnique({
    where: { id: input.roomId },
    include: { settings: true },
  });
  if (!room) throw new Error("Room not found");

  const category = (card.category as "transfer" | "fixture") || def.category;
  if (category === "transfer" && room.phase !== "bidding") {
    throw new Error("Transfer cards can only be used during the market");
  }
  if (category === "fixture" && room.phase !== "league") {
    throw new Error("Fixture cards can only be used during the league");
  }

  let result: Record<string, unknown> = { type: card.type, name: def.name };

  switch (card.type) {
    case "cash_injection": {
      const amount = randInt(15, 25) * 1_000_000;
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount };
      break;
    }
    case "scout_bonus": {
      const amount = 8_000_000;
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount };
      break;
    }
    case "mega_injection": {
      const amount = 40_000_000;
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount };
      break;
    }
    case "underdog_fund": {
      const squad = await prisma.squadPlayer.findMany({
        where: { userId: input.userId },
        include: { player: true },
      });
      const avg =
        squad.length === 0
          ? 0
          : squad.reduce(
              (s, e) => s + (e.player.boostedRating ?? e.player.baseRating),
              0
            ) / squad.length;
      const amount = avg < 82 ? 20_000_000 : 5_000_000;
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount, avgRating: Math.round(avg) };
      break;
    }
    case "tax_refund": {
      const lastSale = await prisma.auction.findFirst({
        where: {
          roomId: input.roomId,
          sellerId: input.userId,
          status: "closed",
          isResale: true,
        },
        orderBy: { createdAt: "desc" },
      });
      if (!lastSale) throw new Error("No completed resale to refund");
      const amount = Math.floor(lastSale.currentBid * 0.5);
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount };
      break;
    }
    case "fee_rebate": {
      await createEffect({
        roomId: input.roomId,
        type: "fee_rebate",
        casterId: input.userId,
      });
      result = { ...result, message: "Next auction win refunds 10%" };
      break;
    }
    case "deadline_gift": {
      let amount = 12_000_000;
      const end = room.settings?.transferWindowEndsAt;
      if (end && end.getTime() - Date.now() <= 60 * 60_000) amount += 8_000_000;
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount };
      break;
    }
    case "bargain_hunter": {
      await createEffect({
        roomId: input.roomId,
        type: "bargain_hunter",
        casterId: input.userId,
      });
      result = { ...result, message: "Next auction you start opens at 4M" };
      break;
    }
    case "soft_raise": {
      await createEffect({
        roomId: input.roomId,
        type: "soft_raise",
        casterId: input.userId,
      });
      result = { ...result, message: "Next outbid matches current price" };
      break;
    }
    case "overdraft": {
      await createEffect({
        roomId: input.roomId,
        type: "overdraft",
        casterId: input.userId,
        payload: { allowance: 5_000_000 },
      });
      result = { ...result, message: "One bid may go 5M over budget" };
      break;
    }
    case "silent_bid": {
      await createEffect({
        roomId: input.roomId,
        type: "silent_bid",
        casterId: input.userId,
      });
      result = { ...result, message: "Next bid stays off the toast feed" };
      break;
    }
    case "sniper_guard": {
      if (!input.auctionId) throw new Error("Pick an auction");
      const auction = await requireLiveAuction(input.auctionId, input.roomId);
      if (auction.currentBidderId !== input.userId) {
        throw new Error("You must be winning this auction");
      }
      await createEffect({
        roomId: input.roomId,
        type: "sniper_guard",
        casterId: input.userId,
        auctionId: auction.id,
        expiresAt: new Date(Date.now() + 20_000),
      });
      result = { ...result, auctionId: auction.id, seconds: 20 };
      break;
    }
    case "time_warp": {
      if (!input.auctionId) throw new Error("Pick an auction");
      const auction = await requireLiveAuction(input.auctionId, input.roomId);
      if (auction.currentBidderId !== input.userId) {
        throw new Error("You must be winning this auction");
      }
      const endsAt = new Date(auction.endsAt.getTime() + 25_000);
      await prisma.auction.update({ where: { id: auction.id }, data: { endsAt } });
      await setAuctionEnd(auction.id, endsAt);
      result = { ...result, endsAt: endsAt.toISOString() };
      break;
    }
    case "exclusive_rights": {
      if (!input.auctionId) throw new Error("Pick an auction");
      const auction = await requireLiveAuction(input.auctionId, input.roomId);
      await createEffect({
        roomId: input.roomId,
        type: "exclusive_rights",
        casterId: input.userId,
        auctionId: auction.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      result = { ...result, auctionId: auction.id, seconds: 60 };
      break;
    }
    case "first_dibs": {
      if (!input.playerId) throw new Error("Pick a player");
      const player = await prisma.player.findFirst({
        where: {
          id: input.playerId,
          roomId: input.roomId,
          status: "available",
          isIcon: false,
        },
      });
      if (!player) throw new Error("Player not available");

      let startPrice = DEFAULT_STARTING_BID;
      const bargain = await consumeOneShotEffect(
        input.roomId,
        "bargain_hunter",
        input.userId
      );
      if (bargain) startPrice = 4_000_000;
      const trap = await prisma.marketEffect.findFirst({
        where: { roomId: input.roomId, type: "price_trap", playerId: player.id },
      });
      if (trap) {
        startPrice = Math.floor(startPrice * 1.5);
        await prisma.marketEffect.delete({ where: { id: trap.id } });
      }

      const endsAt = getMarketWindowEnd();
      const auction = await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: player.id },
          data: { status: "in_auction" },
        });
        return tx.auction.create({
          data: {
            roomId: input.roomId,
            playerId: player.id,
            startingPrice: startPrice,
            currentBid: startPrice,
            currentBidderId: input.userId,
            status: "active",
            endsAt,
          },
        });
      });
      await setAuctionEnd(auction.id, endsAt);
      await createEffect({
        roomId: input.roomId,
        type: "first_dibs",
        casterId: input.userId,
        auctionId: auction.id,
        expiresAt: new Date(Date.now() + 45_000),
      });
      result = {
        ...result,
        auctionId: auction.id,
        playerName: player.name,
        seconds: 45,
      };
      break;
    }
    case "freeze_auction": {
      if (!input.auctionId) throw new Error("Pick an auction");
      const auction = await requireLiveAuction(input.auctionId, input.roomId);
      const remaining = Math.max(0, auction.endsAt.getTime() - Date.now());
      const endsAt = new Date(Date.now() + 45_000 + remaining);
      await prisma.auction.update({ where: { id: auction.id }, data: { endsAt } });
      await setAuctionEnd(auction.id, endsAt);
      await createEffect({
        roomId: input.roomId,
        type: "freeze_auction",
        casterId: input.userId,
        auctionId: auction.id,
        expiresAt: new Date(Date.now() + 45_000),
        payload: { pausedRemainingMs: remaining },
      });
      result = { ...result, auctionId: auction.id, seconds: 45 };
      break;
    }
    case "bid_ban": {
      if (!input.auctionId || !input.targetUserId) {
        throw new Error("Pick an auction and a rival");
      }
      const auction = await requireLiveAuction(input.auctionId, input.roomId);
      if (input.targetUserId === input.userId) throw new Error("Cannot ban yourself");
      await createEffect({
        roomId: input.roomId,
        type: "bid_ban",
        casterId: input.userId,
        auctionId: auction.id,
        targetUserId: input.targetUserId,
        expiresAt: new Date(Date.now() + 90_000),
      });
      result = { ...result, auctionId: auction.id, targetUserId: input.targetUserId };
      break;
    }
    case "price_trap": {
      if (!input.playerId) throw new Error("Pick a player");
      const player = await prisma.player.findFirst({
        where: {
          id: input.playerId,
          roomId: input.roomId,
          status: "available",
          isIcon: false,
        },
      });
      if (!player) throw new Error("Player not available");
      await createEffect({
        roomId: input.roomId,
        type: "price_trap",
        casterId: input.userId,
        playerId: player.id,
      });
      result = { ...result, playerName: player.name };
      break;
    }
    case "blacklist": {
      if (!input.playerId) throw new Error("Pick a player");
      const player = await prisma.player.findFirst({
        where: {
          id: input.playerId,
          roomId: input.roomId,
          status: "available",
          isIcon: false,
        },
      });
      if (!player) throw new Error("Player not available");
      await createEffect({
        roomId: input.roomId,
        type: "blacklist",
        casterId: input.userId,
        playerId: player.id,
        expiresAt: new Date(Date.now() + 3 * 60_000),
      });
      result = { ...result, playerName: player.name, seconds: 180 };
      break;
    }
    case "whip_round": {
      const winning = await prisma.auction.findMany({
        where: {
          roomId: input.roomId,
          status: "active",
          currentBidderId: input.userId,
        },
      });
      for (const a of winning) {
        const endsAt = new Date(a.endsAt.getTime() + 15_000);
        await prisma.auction.update({ where: { id: a.id }, data: { endsAt } });
        await setAuctionEnd(a.id, endsAt);
      }
      result = { ...result, extended: winning.length };
      break;
    }
    case "bid_shield": {
      if (!input.auctionId) throw new Error("Pick your resale auction");
      const auction = await requireLiveAuction(input.auctionId, input.roomId);
      if (!auction.isResale || auction.sellerId !== input.userId) {
        throw new Error("Only your own resale listing");
      }
      await createEffect({
        roomId: input.roomId,
        type: "bid_shield",
        casterId: input.userId,
        auctionId: auction.id,
        expiresAt: new Date(Date.now() + 2 * 60_000),
        payload: { extra: 3_000_000 },
      });
      result = { ...result, auctionId: auction.id };
      break;
    }
    case "panic_sell": {
      if (!input.playerId) throw new Error("Pick a squad player");
      const entry = await prisma.squadPlayer.findFirst({
        where: { userId: input.userId, playerId: input.playerId },
        include: { player: true },
      });
      if (!entry) throw new Error("Not in your squad");
      const amount = Math.floor(entry.player.marketValue * 0.7);
      await prisma.$transaction(async (tx) => {
        await tx.squadPlayer.delete({ where: { id: entry.id } });
        await tx.player.update({
          where: { id: entry.playerId },
          data: { status: "available", listingEndsAt: nextListingEndsAt() },
        });
        await tx.user.update({
          where: { id: input.userId },
          data: { budget: { increment: amount } },
        });
      });
      result = { ...result, playerName: entry.player.name, amount };
      break;
    }
    case "soft_cap": {
      await createEffect({
        roomId: input.roomId,
        type: "soft_cap",
        casterId: input.userId,
      });
      result = { ...result, message: "You may hold 19 players until you sell one" };
      break;
    }
    case "free_agent": {
      const count = await prisma.squadPlayer.count({ where: { userId: input.userId } });
      const soft = await prisma.marketEffect.findFirst({
        where: { roomId: input.roomId, type: "soft_cap", casterId: input.userId },
      });
      const limit = soft ? SQUAD_LIMIT + 1 : SQUAD_LIMIT;
      if (count >= limit) throw new Error("Squad full");

      const pool = await prisma.player.findMany({
        where: {
          roomId: input.roomId,
          status: "available",
          isIcon: false,
          baseRating: { gte: 75, lte: 80 },
        },
        take: 40,
      });
      if (pool.length === 0) throw new Error("No free agents in range");
      const pick = pool[Math.floor(Math.random() * pool.length)];
      await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: pick.id },
          data: { status: "owned" },
        });
        await tx.squadPlayer.create({
          data: {
            userId: input.userId,
            playerId: pick.id,
            isStarting: false,
            purchasePrice: 0,
          },
        });
      });
      result = { ...result, playerName: pick.name, rating: pick.baseRating };
      break;
    }
    case "clone": {
      if (!input.playerId || !input.targetUserId) {
        throw new Error("Pick an opponent player");
      }
      const source = await prisma.squadPlayer.findFirst({
        where: { userId: input.targetUserId, playerId: input.playerId },
        include: { player: true },
      });
      if (!source) throw new Error("Opponent does not own that player");
      const count = await prisma.squadPlayer.count({ where: { userId: input.userId } });
      if (count >= SQUAD_LIMIT) throw new Error("Squad full");

      const clone = await prisma.player.create({
        data: {
          roomId: input.roomId,
          name: `${source.player.name} (Clone)`,
          realTeam: source.player.realTeam,
          league: source.player.league,
          position: source.player.position,
          baseRating: source.player.baseRating,
          boostedRating: source.player.boostedRating,
          boostedStats: source.player.boostedStats ?? undefined,
          marketValue: source.player.marketValue,
          status: "owned",
          isIcon: source.player.isIcon,
        },
      });
      await prisma.squadPlayer.create({
        data: {
          userId: input.userId,
          playerId: clone.id,
          isStarting: false,
          purchasePrice: 0,
        },
      });
      result = { ...result, playerName: clone.name };
      break;
    }
    case "scout_report": {
      const top = await prisma.player.findMany({
        where: { roomId: input.roomId, status: "available", isIcon: false },
        orderBy: { baseRating: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          position: true,
          baseRating: true,
          realTeam: true,
          marketValue: true,
        },
      });
      result = { ...result, players: top };
      break;
    }
    case "budget_peek": {
      if (!input.targetUserId) throw new Error("Pick a rival");
      const rival = await prisma.user.findFirst({
        where: { id: input.targetUserId, roomId: input.roomId },
      });
      if (!rival) throw new Error("Rival not found");
      const committed = await getCommittedBudget(rival.id);
      result = {
        ...result,
        teamName: rival.teamName,
        availableBudget: rival.budget - committed,
      };
      break;
    }
    case "boost_steal": {
      if (!input.playerId || !input.ownPlayerId) {
        throw new Error("Pick opponent boosted player and your receiver");
      }
      const theirs = await prisma.squadPlayer.findFirst({
        where: { playerId: input.playerId },
        include: { player: true, user: true },
      });
      if (!theirs || theirs.userId === input.userId) {
        throw new Error("Pick an opponent player");
      }
      if (
        theirs.player.boostedRating == null ||
        theirs.player.boostedRating <= theirs.player.baseRating
      ) {
        throw new Error("That player has no boost to steal");
      }
      const mine = await prisma.squadPlayer.findFirst({
        where: { userId: input.userId, playerId: input.ownPlayerId },
        include: { player: true },
      });
      if (!mine) throw new Error("Receiver not in your squad");

      const boost = theirs.player.boostedRating;
      const stolenStats = theirs.player.boostedStats ?? null;
      await prisma.player.update({
        where: { id: theirs.playerId },
        data: { boostedRating: null, boostedStats: Prisma.DbNull },
      });
      await prisma.player.update({
        where: { id: mine.playerId },
        data: {
          boostedRating: boost,
          boostedStats: stolenStats === null ? Prisma.DbNull : stolenStats,
        },
      });
      result = {
        ...result,
        stolenFrom: theirs.player.name,
        appliedTo: mine.player.name,
        rating: boost,
        stats: stolenStats,
      };
      break;
    }
    case "free_icon": {
      await ensureIconPool(input.roomId);
      const count = await prisma.squadPlayer.count({ where: { userId: input.userId } });
      if (count >= SQUAD_LIMIT) throw new Error("Squad full — free a slot first");
      const icons = await prisma.player.findMany({
        where: { roomId: input.roomId, isIcon: true, status: "icon_pool" },
        take: 30,
      });
      if (icons.length === 0) throw new Error("No icons left in pool");
      const pick = icons[Math.floor(Math.random() * icons.length)];
      await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: pick.id },
          data: { status: "owned" },
        });
        await tx.squadPlayer.create({
          data: {
            userId: input.userId,
            playerId: pick.id,
            isStarting: false,
            purchasePrice: 0,
          },
        });
      });
      result = { ...result, playerName: pick.name, rating: pick.baseRating };
      break;
    }
    case "mystery_box": {
      const settings = room.settings;
      const enabled =
        settings?.enabledCardTypes?.length && settings.enabledCardTypes.length > 0
          ? settings.enabledCardTypes
          : [...DEFAULT_TRANSFER_CARD_KEYS];
      const [next] = pickWeightedCardKeys(
        enabled.filter((k) => k !== "mystery_box"),
        1,
        "transfer",
        true
      );
      if (!next) throw new Error("No card to transform into");
      await prisma.card.update({
        where: { id: card.id },
        data: {
          type: next,
          used: false,
          category: "transfer",
          metadata: { fromMystery: true },
        },
      });
      return {
        transformed: true,
        type: next,
        name: CARD_BY_KEY[next]?.name ?? next,
        message: `Mystery Box became ${CARD_BY_KEY[next]?.name ?? next}`,
      };
    }
    case "double_points":
    case "clean_sheet_cash":
    case "goal_bounty":
    case "draw_insurance":
    case "home_crowd":
    case "away_day":
    case "matchday_pay":
    case "must_win_wager":
    case "streak_saver": {
      await createEffect({
        roomId: input.roomId,
        type: card.type,
        casterId: input.userId,
      });
      result = { ...result, message: `${def.name} armed for your next match` };
      break;
    }
    case "injury_fund": {
      const amount = 15_000_000;
      await prisma.user.update({
        where: { id: input.userId },
        data: { budget: { increment: amount } },
      });
      result = { ...result, amount };
      break;
    }
    case "scout_xi": {
      if (!input.targetUserId) throw new Error("Pick a rival");
      const squad = await prisma.squadPlayer.findMany({
        where: { userId: input.targetUserId },
        include: { player: true },
        orderBy: { player: { baseRating: "desc" } },
      });
      const rival = await prisma.user.findUnique({ where: { id: input.targetUserId } });
      result = {
        ...result,
        teamName: rival?.teamName,
        players: squad.map((s) => ({
          name: s.player.name,
          position: s.player.position,
          rating: s.player.boostedRating ?? s.player.baseRating,
          starting: s.isStarting,
        })),
      };
      break;
    }
    case "derby_boost": {
      if (!input.matchId) throw new Error("Pick a fixture");
      const m = await prisma.match.findFirst({
        where: {
          id: input.matchId,
          roomId: input.roomId,
          status: { in: ["scheduled", "pending_confirmation"] },
          OR: [{ homeUserId: input.userId }, { awayUserId: input.userId }],
        },
      });
      if (!m) throw new Error("Match not found or not yours");
      await createEffect({
        roomId: input.roomId,
        type: "derby_boost",
        casterId: input.userId,
        auctionId: m.id, // reuse field as matchId
      });
      result = { ...result, message: "Derby Boost attached to fixture", matchId: m.id };
      break;
    }
    default:
      throw new Error("Card not implemented yet");
  }

  await prisma.card.update({
    where: { id: card.id },
    data: {
      used: true,
      metadata: { ...(card.metadata as object), result } as Prisma.InputJsonValue,
    },
  });

  return result;
}

async function requireLiveAuction(auctionId: string, roomId: string) {
  const auction = await prisma.auction.findFirst({
    where: { id: auctionId, roomId, status: "active" },
  });
  if (!auction) throw new Error("Auction not found or closed");
  if (auction.endsAt.getTime() <= Date.now()) throw new Error("Auction expired");
  return auction;
}
