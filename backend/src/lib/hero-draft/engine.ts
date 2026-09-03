import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socket-emit";
import { seedPlayersForRoom } from "@/lib/players/seed";
import { ICON_CATALOG, iconMarketValue } from "@/lib/icons/pool";
import { HERO_CATALOG } from "@/lib/icons/heroes";
import {
  DEFAULT_SLOT_TEMPLATE,
  TOTAL_DRAFT_SLOTS,
  pickRandomUnfilledSlotIndex,
  type DraftSlotDef,
} from "./slots";
import {
  DEFAULT_TIER_WEIGHTS,
  flagsFromTier,
  type TierWeights,
  type PlayerTier,
} from "./tiers";
import {
  shuffleIds,
  getTurnHolder,
  advanceTurnPointer,
  pickGoldenRoundIndex,
} from "./turn-order";
import { initBidRound, placeBid, passBid, type BidRoundState } from "./bidding-machine";
import { pickPlayerForSlot } from "./player-pick";
import { computeRandomRollDeduction } from "./deductions";

function normalizePos(pos: string) {
  return pos === "CF" ? "ST" : pos;
}

async function ensureHeroDraftPool(roomId: string) {
  await seedPlayersForRoom(roomId);

  const existingIcons = await prisma.player.findMany({
    where: { roomId, tier: "ICON" },
    select: { name: true },
  });
  const iconNames = new Set(existingIcons.map((p) => p.name));
  const iconsToCreate = ICON_CATALOG.filter((i) => !iconNames.has(i.name));
  if (iconsToCreate.length > 0) {
    await prisma.player.createMany({
      data: iconsToCreate.map((i) => ({
        roomId,
        name: i.name,
        realTeam: i.realTeam,
        league: "Icons",
        position: normalizePos(i.position),
        baseRating: i.baseRating,
        marketValue: iconMarketValue(i.baseRating),
        status: "available",
        tier: "ICON" as const,
        ...flagsFromTier("ICON"),
      })),
    });
  }

  const existingHeroes = await prisma.player.findMany({
    where: { roomId, tier: "HERO" },
    select: { name: true },
  });
  const heroNames = new Set(existingHeroes.map((p) => p.name));
  const heroesToCreate = HERO_CATALOG.filter((i) => !heroNames.has(i.name));
  if (heroesToCreate.length > 0) {
    await prisma.player.createMany({
      data: heroesToCreate.map((i) => ({
        roomId,
        name: i.name,
        realTeam: i.realTeam,
        league: "Heroes",
        position: normalizePos(i.position),
        baseRating: i.baseRating,
        marketValue: iconMarketValue(i.baseRating),
        status: "available",
        tier: "HERO" as const,
        ...flagsFromTier("HERO"),
      })),
    });
  }
}

function stateToBidRound(state: {
  biddingOrder: string[];
  currentTurnHolderId: string | null;
  currentRoundActiveBidders: string[];
  currentRoundPassedBidders: string[];
  currentRoundLastBids: unknown;
  currentRoundHighestBid: number | null;
  currentRoundHighestBidderId: string | null;
  currentRoundTurnUserId: string | null;
}): BidRoundState {
  const lastBids =
    state.currentRoundLastBids && typeof state.currentRoundLastBids === "object"
      ? (state.currentRoundLastBids as Record<string, number>)
      : {};
  return {
    biddingOrder: state.biddingOrder,
    turnHolderId: state.currentTurnHolderId!,
    activeBidders: state.currentRoundActiveBidders,
    passedBidders: state.currentRoundPassedBidders,
    lastBids,
    highestBid: state.currentRoundHighestBid,
    highestBidderId: state.currentRoundHighestBidderId,
    turnUserId: state.currentRoundTurnUserId,
    openingComplete: state.currentRoundHighestBid != null,
  };
}

async function persistBidState(
  roomId: string,
  bid: BidRoundState,
  turnExpiresAt: Date | null
) {
  await prisma.heroDraftState.update({
    where: { roomId },
    data: {
      currentRoundActiveBidders: bid.activeBidders,
      currentRoundPassedBidders: bid.passedBidders,
      currentRoundLastBids: bid.lastBids,
      currentRoundHighestBid: bid.highestBid,
      currentRoundHighestBidderId: bid.highestBidderId,
      currentRoundTurnUserId: bid.turnUserId,
      currentRoundTurnExpiresAt: turnExpiresAt,
    },
  });
}

async function loadRoomDraft(code: string) {
  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      heroDraftState: true,
      heroDraftSettings: true,
      users: { select: { id: true, displayName: true, budget: true } },
    },
  });
  if (!room) throw new Error("Room not found");
  if (room.mode !== "HERO_DRAFT") throw new Error("Room is not Hero Draft mode");
  if (!room.heroDraftState) throw new Error("Hero Draft state missing");
  return room;
}

function turnTimeoutMs(settings: { bidTurnTimeoutSeconds: number } | null) {
  return (settings?.bidTurnTimeoutSeconds ?? 20) * 1000;
}

function weightsFromSettings(settings: {
  tierWeightGold: number;
  tierWeightHero: number;
  tierWeightIcon: number;
} | null): TierWeights {
  if (!settings) return DEFAULT_TIER_WEIGHTS;
  return {
    GOLD: settings.tierWeightGold,
    HERO: settings.tierWeightHero,
    ICON: settings.tierWeightIcon,
  };
}

export async function startHeroDraft(roomCode: string) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (state.status !== "not_started") {
    throw new Error("Draft already started");
  }
  if (room.users.length < 2) {
    throw new Error("Need at least 2 players to start the draft");
  }

  await ensureHeroDraftPool(room.id);

  const userIds = room.users.map((u) => u.id);
  const turnQueue = shuffleIds(userIds);
  const biddingOrder = shuffleIds(userIds);
  const goldenRoundIndex = pickGoldenRoundIndex(TOTAL_DRAFT_SLOTS);
  const weights = weightsFromSettings(room.heroDraftSettings);
  const budget = room.heroDraftSettings?.startingBudget ?? 500_000_000;

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { roomId: room.id },
      data: { budget },
    }),
    prisma.heroDraftState.update({
      where: { roomId: room.id },
      data: {
        status: "in_progress",
        currentRound: 0,
        goldenRoundIndex,
        turnQueue,
        turnQueuePointer: 0,
        biddingOrder,
        slotTemplate: DEFAULT_SLOT_TEMPLATE,
        filledSlotIndexes: [],
        tierWeights: weights,
        goldenRoundMinRating:
          room.heroDraftSettings?.goldenRoundMinRating ?? 80,
      },
    }),
    prisma.room.update({
      where: { id: room.id },
      data: { phase: "hero_draft" },
    }),
  ]);

  await emitToRoom(room.code, "phase:changed", { phase: "hero_draft" });
  await beginRound(room.code);
  return { ok: true };
}

export async function beginRound(roomCode: string) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (state.status !== "in_progress") {
    throw new Error("Draft is not in progress");
  }
  if (state.pendingReleaseUserIds.length > 0) {
    throw new Error("Waiting for forced player releases");
  }
  if (state.filledSlotIndexes.length >= TOTAL_DRAFT_SLOTS) {
    return completeDraft(room.code);
  }

  const template = (state.slotTemplate as DraftSlotDef[]) ?? DEFAULT_SLOT_TEMPLATE;
  const slotIndex = pickRandomUnfilledSlotIndex(state.filledSlotIndexes, template.length);
  const slot = template[slotIndex];
  const weights = (state.tierWeights as TierWeights) ?? DEFAULT_TIER_WEIGHTS;
  const isGolden = state.goldenRoundIndex === state.currentRound;

  const available = await prisma.player.findMany({
    where: { roomId: room.id, status: "available" },
    select: {
      id: true,
      position: true,
      tier: true,
      baseRating: true,
      marketValue: true,
      status: true,
      name: true,
    },
  });

  const auctioned = pickPlayerForSlot({
    pool: available.map((p) => ({
      ...p,
      tier: p.tier as PlayerTier,
    })),
    slot,
    weights,
    minRating: isGolden ? state.goldenRoundMinRating : undefined,
  });
  if (!auctioned) {
    throw new Error(`No available players for slot ${slot.label}`);
  }

  const turnHolderId = getTurnHolder(state.turnQueue, state.turnQueuePointer);
  const bid = initBidRound({
    biddingOrder: state.biddingOrder,
    turnHolderId,
  });
  const expiresAt = new Date(Date.now() + turnTimeoutMs(room.heroDraftSettings));

  await prisma.heroDraftState.update({
    where: { roomId: room.id },
    data: {
      currentSlotIndex: slotIndex,
      currentAuctionedPlayerId: auctioned.id,
      currentTurnHolderId: turnHolderId,
      currentRoundActiveBidders: bid.activeBidders,
      currentRoundPassedBidders: [],
      currentRoundLastBids: {},
      currentRoundHighestBid: null,
      currentRoundHighestBidderId: null,
      currentRoundTurnUserId: bid.turnUserId,
      currentRoundTurnExpiresAt: expiresAt,
      pendingReleaseUserIds: [],
    },
  });

  // Reserve auctioned player so random rolls can't pick the same one mid-round
  await prisma.player.update({
    where: { id: auctioned.id },
    data: { status: "draft_auction" },
  });

  const player = await prisma.player.findUniqueOrThrow({ where: { id: auctioned.id } });

  if (isGolden) {
    await emitToRoom(room.code, "round:goldenAnnounced", {
      roundIndex: state.currentRound,
      minRating: state.goldenRoundMinRating,
    });
  }

  await emitToRoom(room.code, "round:started", {
    roundIndex: state.currentRound,
    slotIndex,
    slot,
    isGoldenRound: isGolden,
    turnHolderId,
    biddingOrder: state.biddingOrder,
    player,
  });

  await emitToRoom(room.code, "bidTurn:started", {
    roundIndex: state.currentRound,
    turnUserId: bid.turnUserId,
    highestBid: null,
    highestBidderId: null,
    expiresAt: expiresAt.toISOString(),
    activeBidders: bid.activeBidders,
  });

  return { ok: true, slotIndex, playerId: auctioned.id };
}

export async function heroDraftPlaceBid(
  roomCode: string,
  userId: string,
  amount: number
) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (state.status !== "in_progress") throw new Error("Draft not in progress");

  const settings = room.heroDraftSettings;
  const user = room.users.find((u) => u.id === userId);
  if (!user) throw new Error("User not in room");
  if (amount > user.budget) throw new Error("Insufficient budget");

  // Opening bid minimum = market value when turn holder must open
  if (
    !state.currentRoundHighestBid &&
    state.currentTurnHolderId === userId &&
    settings?.turnHolderMustOpenBid
  ) {
    const player = await prisma.player.findUnique({
      where: { id: state.currentAuctionedPlayerId! },
    });
    if (player && amount < player.marketValue) {
      throw new Error(`Opening bid must be at least ${player.marketValue}`);
    }
  }

  const current = stateToBidRound(state);
  const result = placeBid(current, userId, amount);
  if (!result.ok) throw new Error(result.error);

  const expiresAt = result.closed
    ? null
    : new Date(Date.now() + turnTimeoutMs(settings));
  await persistBidState(room.id, result.state, expiresAt);

  await emitToRoom(room.code, "bidTurn:bidPlaced", {
    roundIndex: state.currentRound,
    userId,
    amount,
    highestBid: result.state.highestBid,
    highestBidderId: result.state.highestBidderId,
  });

  if (result.closed) {
    await resolveRoundAuction(room.code, result.winnerId, result.winningBid);
    return { closed: true as const };
  }

  await emitToRoom(room.code, "bidTurn:started", {
    roundIndex: state.currentRound,
    turnUserId: result.state.turnUserId,
    highestBid: result.state.highestBid,
    highestBidderId: result.state.highestBidderId,
    expiresAt: expiresAt!.toISOString(),
    activeBidders: result.state.activeBidders,
  });

  return { closed: false as const };
}

export async function heroDraftPass(
  roomCode: string,
  userId: string,
  auto = false
) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (state.status !== "in_progress") throw new Error("Draft not in progress");

  const current = stateToBidRound(state);
  const result = passBid(current, userId);
  if (!result.ok) throw new Error(result.error);

  const expiresAt = result.closed
    ? null
    : new Date(Date.now() + turnTimeoutMs(room.heroDraftSettings));
  await persistBidState(room.id, result.state, expiresAt);

  await emitToRoom(room.code, auto ? "bidTurn:autoPassed" : "bidTurn:passed", {
    roundIndex: state.currentRound,
    userId,
    activeBidders: result.state.activeBidders,
    passedBidders: result.state.passedBidders,
  });

  if (result.closed) {
    await resolveRoundAuction(room.code, result.winnerId, result.winningBid);
    return { closed: true as const };
  }

  await emitToRoom(room.code, "bidTurn:started", {
    roundIndex: state.currentRound,
    turnUserId: result.state.turnUserId,
    highestBid: result.state.highestBid,
    highestBidderId: result.state.highestBidderId,
    expiresAt: expiresAt!.toISOString(),
    activeBidders: result.state.activeBidders,
  });

  return { closed: false as const };
}

export async function processExpiredBidTurns() {
  const now = new Date();
  const due = await prisma.heroDraftState.findMany({
    where: {
      status: "in_progress",
      currentRoundTurnExpiresAt: { lte: now },
      currentRoundTurnUserId: { not: null },
    },
    include: { room: { select: { code: true } } },
    take: 20,
  });

  for (const s of due) {
    try {
      if (!s.currentRoundTurnUserId) continue;
      await heroDraftPass(s.room.code, s.currentRoundTurnUserId, true);
    } catch (err) {
      console.error("Hero draft auto-pass failed:", err);
    }
  }
}

async function resolveRoundAuction(
  roomCode: string,
  winnerId: string,
  winningBid: number
) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  const slotIndex = state.currentSlotIndex!;
  const template = (state.slotTemplate as DraftSlotDef[]) ?? DEFAULT_SLOT_TEMPLATE;
  const slot = template[slotIndex];
  const playerId = state.currentAuctionedPlayerId!;
  const isGolden = state.goldenRoundIndex === state.currentRound;
  const lastBids =
    state.currentRoundLastBids && typeof state.currentRoundLastBids === "object"
      ? (state.currentRoundLastBids as Record<string, number>)
      : {};
  const weights = (state.tierWeights as TierWeights) ?? DEFAULT_TIER_WEIGHTS;
  const passiveRatio = room.heroDraftSettings?.passiveDeductionRatio ?? 0.5;

  // Charge winner + assign squad slot
  await prisma.$transaction([
    prisma.user.update({
      where: { id: winnerId },
      data: { budget: { decrement: winningBid } },
    }),
    prisma.player.update({
      where: { id: playerId },
      data: { status: "owned" },
    }),
    prisma.squadPlayer.create({
      data: {
        userId: winnerId,
        playerId,
        isStarting: slot.isStarting,
        purchasePrice: winningBid,
        draftSlotIndex: slotIndex,
        draftAcquisition: "auction",
      },
    }),
  ]);

  await emitToRoom(room.code, "auction:closed", {
    roundIndex: state.currentRound,
    winnerId,
    winningBid,
    playerId,
    slotIndex,
  });

  // Random rolls for everyone else
  const losers = room.users.filter((u) => u.id !== winnerId);
  const usedIds = new Set<string>([playerId]);
  const available = await prisma.player.findMany({
    where: { roomId: room.id, status: "available" },
    select: {
      id: true,
      position: true,
      tier: true,
      baseRating: true,
      marketValue: true,
      status: true,
      name: true,
    },
  });

  type RollRecord = {
    userId: string;
    playerId: string;
    tier: string;
    rating: number;
    lastBidAmount: number | null;
    deductionAmount: number;
    deductionType: string;
  };
  const randomRolls: RollRecord[] = [];
  const passOrder = state.currentRoundPassedBidders.map((uid) => ({
    userId: uid,
    passedAtBidAmount: state.currentRoundHighestBid,
    lastBidAmount: lastBids[uid] ?? null,
  }));
  const pendingReleases: string[] = [];

  for (const loser of losers) {
    const lastBid = lastBids[loser.id] ?? null;
    const deduction = computeRandomRollDeduction({
      lastBidAmount: lastBid,
      winningBid,
      passiveDeductionRatio: passiveRatio,
    });

    const picked = pickPlayerForSlot({
      pool: available
        .filter((p) => !usedIds.has(p.id))
        .map((p) => ({ ...p, tier: p.tier as PlayerTier })),
      slot,
      weights,
      minRating: isGolden ? state.goldenRoundMinRating : undefined,
      excludeIds: usedIds,
    });

    if (!picked) {
      console.warn(`No random roll player for user ${loser.id} slot ${slot.label}`);
      continue;
    }
    usedIds.add(picked.id);

    // Mark taken in local pool list
    const idx = available.findIndex((p) => p.id === picked.id);
    if (idx >= 0) available[idx] = { ...available[idx], status: "owned" };

    const freshUser = await prisma.user.findUniqueOrThrow({ where: { id: loser.id } });
    if (freshUser.budget < deduction.amount) {
      // Assign player unpaid; mark pending release
      await prisma.$transaction([
        prisma.player.update({
          where: { id: picked.id },
          data: { status: "owned" },
        }),
        prisma.squadPlayer.create({
          data: {
            userId: loser.id,
            playerId: picked.id,
            isStarting: slot.isStarting,
            purchasePrice: deduction.amount,
            draftSlotIndex: slotIndex,
            draftAcquisition: "random_roll",
          },
        }),
      ]);
      pendingReleases.push(loser.id);
      randomRolls.push({
        userId: loser.id,
        playerId: picked.id,
        tier: picked.tier,
        rating: picked.baseRating,
        lastBidAmount: deduction.lastBidAmount,
        deductionAmount: deduction.amount,
        deductionType: deduction.deductionType,
      });
      await emitToRoom(room.code, "randomRoll:insufficientFunds", {
        userId: loser.id,
        requiredAmount: deduction.amount,
        budget: freshUser.budget,
        playerId: picked.id,
        roundIndex: state.currentRound,
      });
    } else {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: loser.id },
          data: { budget: { decrement: deduction.amount } },
        }),
        prisma.player.update({
          where: { id: picked.id },
          data: { status: "owned" },
        }),
        prisma.squadPlayer.create({
          data: {
            userId: loser.id,
            playerId: picked.id,
            isStarting: slot.isStarting,
            purchasePrice: deduction.amount,
            draftSlotIndex: slotIndex,
            draftAcquisition: "random_roll",
          },
        }),
      ]);
      randomRolls.push({
        userId: loser.id,
        playerId: picked.id,
        tier: picked.tier,
        rating: picked.baseRating,
        lastBidAmount: deduction.lastBidAmount,
        deductionAmount: deduction.amount,
        deductionType: deduction.deductionType,
      });
    }

    await emitToRoom(room.code, "randomRoll:revealed", {
      userId: loser.id,
      playerId: picked.id,
      tier: picked.tier,
      rating: picked.baseRating,
      deductionAmount: deduction.amount,
      deductionType: deduction.deductionType,
      roundIndex: state.currentRound,
      slotIndex,
    });
  }

  await prisma.draftRoundHistory.create({
    data: {
      roomId: room.id,
      roundIndex: state.currentRound,
      slotIndex,
      slotPosition: slot.label,
      isGoldenRound: isGolden,
      auctionedPlayerId: playerId,
      turnHolderId: state.currentTurnHolderId!,
      winnerId,
      winningBid,
      passOrder,
      randomRolls,
    },
  });

  const filled = [...state.filledSlotIndexes, slotIndex];

  if (pendingReleases.length > 0) {
    await prisma.heroDraftState.update({
      where: { roomId: room.id },
      data: {
        status: "awaiting_releases",
        pendingReleaseUserIds: pendingReleases,
        filledSlotIndexes: filled,
        currentRoundTurnUserId: null,
        currentRoundTurnExpiresAt: null,
      },
    });
    return;
  }

  await finishRoundAdvance(room.code, filled);
}

async function finishRoundAdvance(roomCode: string, filledSlotIndexes: number[]) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  const nextPointer = advanceTurnPointer(state.turnQueuePointer, state.turnQueue.length);
  const nextRound = state.currentRound + 1;

  await emitToRoom(room.code, "round:completed", {
    roundIndex: state.currentRound,
    filledSlotIndexes,
    nextRound,
  });

  if (filledSlotIndexes.length >= TOTAL_DRAFT_SLOTS) {
    await prisma.heroDraftState.update({
      where: { roomId: room.id },
      data: {
        status: "in_progress",
        filledSlotIndexes,
        turnQueuePointer: nextPointer,
        currentRound: nextRound,
        currentSlotIndex: null,
        currentAuctionedPlayerId: null,
        currentTurnHolderId: null,
        currentRoundActiveBidders: [],
        currentRoundPassedBidders: [],
        currentRoundLastBids: {},
        currentRoundHighestBid: null,
        currentRoundHighestBidderId: null,
        currentRoundTurnUserId: null,
        currentRoundTurnExpiresAt: null,
        pendingReleaseUserIds: [],
      },
    });
    return completeDraft(room.code);
  }

  await prisma.heroDraftState.update({
    where: { roomId: room.id },
    data: {
      status: "in_progress",
      filledSlotIndexes,
      turnQueuePointer: nextPointer,
      currentRound: nextRound,
      currentSlotIndex: null,
      currentAuctionedPlayerId: null,
      currentTurnHolderId: null,
      currentRoundActiveBidders: [],
      currentRoundPassedBidders: [],
      currentRoundLastBids: {},
      currentRoundHighestBid: null,
      currentRoundHighestBidderId: null,
      currentRoundTurnUserId: null,
      currentRoundTurnExpiresAt: null,
      pendingReleaseUserIds: [],
    },
  });

  await beginRound(room.code);
}

export async function forceReleasePlayer(
  roomCode: string,
  userId: string,
  releaseSquadPlayerId: string
) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (state.status !== "awaiting_releases") {
    throw new Error("No pending releases");
  }
  if (!state.pendingReleaseUserIds.includes(userId)) {
    throw new Error("You do not owe a release");
  }

  const history = await prisma.draftRoundHistory.findUnique({
    where: {
      roomId_roundIndex: { roomId: room.id, roundIndex: state.currentRound },
    },
  });
  if (!history) throw new Error("Round history missing");

  const rolls = history.randomRolls as Array<{
    userId: string;
    deductionAmount: number;
  }>;
  const myRoll = rolls.find((r) => r.userId === userId);
  if (!myRoll) throw new Error("No roll found for user");

  const squadEntry = await prisma.squadPlayer.findFirst({
    where: { id: releaseSquadPlayerId, userId },
    include: { player: true },
  });
  if (!squadEntry) throw new Error("Squad player not found");
  // Cannot release the unpaid roll from this round until they can afford it —
  // they must release an earlier player
  if (squadEntry.draftSlotIndex === history.slotIndex) {
    throw new Error("Release an earlier player, not this round's roll");
  }

  const refund = squadEntry.purchasePrice;
  const vacatedSlot = squadEntry.draftSlotIndex!;
  const template = (state.slotTemplate as DraftSlotDef[]) ?? DEFAULT_SLOT_TEMPLATE;
  const vacatedDef = template[vacatedSlot];

  const available = await prisma.player.findMany({
    where: { roomId: room.id, status: "available", tier: "GOLD" },
    select: {
      id: true,
      position: true,
      tier: true,
      baseRating: true,
      marketValue: true,
      status: true,
    },
  });
  const downgrade = pickPlayerForSlot({
    pool: available.map((p) => ({ ...p, tier: p.tier as PlayerTier })),
    slot: vacatedDef,
    weights: DEFAULT_TIER_WEIGHTS,
    forceTier: "GOLD",
  });
  if (!downgrade) throw new Error("No Gold downgrade available for vacated slot");

  await prisma.$transaction(async (tx) => {
    await tx.squadPlayer.delete({ where: { id: squadEntry.id } });
    await tx.player.update({
      where: { id: squadEntry.playerId },
      data: { status: "available" },
    });
    await tx.user.update({
      where: { id: userId },
      data: { budget: { increment: refund } },
    });
    await tx.player.update({
      where: { id: downgrade.id },
      data: { status: "owned" },
    });
    await tx.squadPlayer.create({
      data: {
        userId,
        playerId: downgrade.id,
        isStarting: vacatedDef.isStarting,
        purchasePrice: 0,
        draftSlotIndex: vacatedSlot,
        draftAcquisition: "downgrade",
      },
    });
    await tx.forcedPlayerRelease.create({
      data: {
        roomId: room.id,
        userId,
        roundIndex: state.currentRound,
        releasedPlayerId: squadEntry.playerId,
        refundAmount: refund,
        downgradeSlotIndex: vacatedSlot,
        downgradePlayerId: downgrade.id,
      },
    });
  });

  await emitToRoom(room.code, "squadSlot:downgraded", {
    userId,
    vacatedSlotIndex: vacatedSlot,
    releasedPlayerId: squadEntry.playerId,
    downgradePlayerId: downgrade.id,
    refundAmount: refund,
  });

  const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (userAfter.budget < myRoll.deductionAmount) {
    // Still can't afford — stay in pending for another release
    return { stillOwes: true as const };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { budget: { decrement: myRoll.deductionAmount } },
  });

  const remaining = state.pendingReleaseUserIds.filter((id) => id !== userId);
  if (remaining.length > 0) {
    await prisma.heroDraftState.update({
      where: { roomId: room.id },
      data: { pendingReleaseUserIds: remaining },
    });
    return { stillOwes: false as const, waitingOthers: true as const };
  }

  await finishRoundAdvance(room.code, state.filledSlotIndexes);
  return { stillOwes: false as const, waitingOthers: false as const };
}

export async function completeDraft(roomCode: string) {
  const room = await loadRoomDraft(roomCode);
  const settings = room.heroDraftSettings;

  if (settings?.tradeWindowEnabled) {
    const endsAt = new Date(
      Date.now() + (settings.tradeWindowMinutes ?? 30) * 60_000
    );
    await prisma.heroDraftState.update({
      where: { roomId: room.id },
      data: { status: "trade_window", tradeWindowEndsAt: endsAt },
    });
    await prisma.room.update({
      where: { id: room.id },
      data: { phase: "trade_window" },
    });
    await emitToRoom(room.code, "draft:completed", { next: "trade_window" });
    await emitToRoom(room.code, "tradeWindow:started", {
      endsAt: endsAt.toISOString(),
    });
    return { next: "trade_window" as const };
  }

  await prisma.heroDraftState.update({
    where: { roomId: room.id },
    data: { status: "completed" },
  });
  await prisma.room.update({
    where: { id: room.id },
    data: { phase: "draft_recap" },
  });
  await emitToRoom(room.code, "draft:completed", { next: "draft_recap" });
  await emitToRoom(room.code, "draftRecap:ready", {});
  return { next: "draft_recap" as const };
}

export async function openTradeWindow(roomCode: string) {
  const room = await loadRoomDraft(roomCode);
  const minutes = room.heroDraftSettings?.tradeWindowMinutes ?? 30;
  const endsAt = new Date(Date.now() + minutes * 60_000);
  await prisma.heroDraftState.update({
    where: { roomId: room.id },
    data: { status: "trade_window", tradeWindowEndsAt: endsAt },
  });
  await prisma.room.update({
    where: { id: room.id },
    data: { phase: "trade_window" },
  });
  await emitToRoom(room.code, "tradeWindow:started", {
    endsAt: endsAt.toISOString(),
  });
}

export async function closeTradeWindow(roomCode: string) {
  const room = await loadRoomDraft(roomCode);
  await prisma.heroDraftState.update({
    where: { roomId: room.id },
    data: { status: "completed", tradeWindowEndsAt: new Date() },
  });
  await prisma.room.update({
    where: { id: room.id },
    data: { phase: "draft_recap" },
  });
  // Reject pending trades
  await prisma.tradeRequest.updateMany({
    where: { roomId: room.id, status: "pending" },
    data: { status: "expired" },
  });
  await emitToRoom(room.code, "tradeWindow:ended", {});
  await emitToRoom(room.code, "draftRecap:ready", {});
}

export async function processExpiredTradeWindows() {
  const now = new Date();
  const due = await prisma.heroDraftState.findMany({
    where: {
      status: "trade_window",
      tradeWindowEndsAt: { lte: now },
    },
    include: { room: { select: { code: true } } },
    take: 10,
  });
  for (const s of due) {
    try {
      await closeTradeWindow(s.room.code);
    } catch (err) {
      console.error("Trade window close failed:", err);
    }
  }
}

/** Admin force-advance: auto-pass current turn user (or skip stuck round). */
export async function forceAdvanceRound(roomCode: string) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (state.currentRoundTurnUserId) {
    return heroDraftPass(roomCode, state.currentRoundTurnUserId, true);
  }
  throw new Error("No active turn to advance");
}
