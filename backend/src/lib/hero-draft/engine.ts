import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socket-emit";
import { seedPlayersForRoom } from "@/lib/players/seed";
import {
  ALL_TIME_CATALOG,
  allTimeMarketValue,
  iconMarketValue,
  tierForAllTimeRating,
} from "@/lib/icons/pool";
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
import { pickPlayerForSlot, effectiveDraftMinRating } from "./player-pick";
import { computeRandomRollDeduction } from "./deductions";
import { notifyBudgetUpdated } from "@/lib/admin/users";
import {
  UNPAID_ROLL_ACQUISITION,
  PAID_ROLL_ACQUISITION,
  withHeroDraftLock,
  lockHeroDraftRoom,
  tryDebitBudget,
  creditBudget,
} from "./budget-ops";

function normalizePos(pos: string) {
  return pos === "CF" ? "ST" : pos;
}

const legendReadyRooms = new Set<string>();

async function createPlayersChunked(
  rows: Array<{
    roomId: string;
    name: string;
    realTeam: string;
    league: string | null;
    position: string;
    baseRating: number;
    marketValue: number;
    status: string;
    tier: PlayerTier;
    isIcon: boolean;
    isHero: boolean;
  }>
) {
  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.player.createMany({ data: rows.slice(i, i + CHUNK) });
  }
}

export async function ensureHeroDraftPool(roomId: string) {
  await seedPlayersForRoom(roomId);
  if (legendReadyRooms.has(roomId)) return;

  const existing = await prisma.player.findMany({
    where: { roomId },
    select: { name: true },
  });
  const names = new Set(existing.map((p) => p.name));

  const allTimeMissing = ALL_TIME_CATALOG.filter((p) => !names.has(p.name));
  if (allTimeMissing.length > 0) {
    await createPlayersChunked(
      allTimeMissing.map((p) => {
        const tier = tierForAllTimeRating(p.baseRating);
        return {
          roomId,
          name: p.name,
          realTeam: p.realTeam,
          league: p.league ?? "All-time",
          position: normalizePos(p.position),
          baseRating: p.baseRating,
          marketValue: allTimeMarketValue(p.baseRating),
          status: "available",
          tier,
          ...flagsFromTier(tier),
        };
      })
    );
    for (const p of allTimeMissing) names.add(p.name);
  }

  const heroesToCreate = HERO_CATALOG.filter((i) => !names.has(i.name));
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

  // Old default 75 hid med/bad/really-bad all-time players. Open the floor so the pyramid can appear.
  await prisma.heroDraftSettings.updateMany({
    where: { roomId, minPlayerRating: 75 },
    data: { minPlayerRating: 45 },
  });
  await prisma.heroDraftState.updateMany({
    where: { roomId, minPlayerRating: 75 },
    data: { minPlayerRating: 45 },
  });

  legendReadyRooms.add(roomId);
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

type ReleaseRoll = {
  roundIndex: number;
  slotIndex: number;
  playerId: string;
  deductionAmount: number;
};

/**
 * Find the unpaid random-roll context for a manager who owes a release.
 * currentRound can drift ahead of DraftRoundHistory after a partial advance —
 * prefer the unpaid squad row, then matching history.
 */
export async function loadPendingReleaseRoll(
  roomId: string,
  userId: string,
  currentRound: number
): Promise<ReleaseRoll | null> {
  type RollRow = { userId: string; playerId: string; deductionAmount?: number };

  const unpaid = await prisma.squadPlayer.findFirst({
    where: { userId, draftAcquisition: UNPAID_ROLL_ACQUISITION },
    orderBy: { draftSlotIndex: "desc" },
  });

  const recent = await prisma.draftRoundHistory.findMany({
    where: { roomId },
    orderBy: { roundIndex: "desc" },
    take: 30,
  });

  if (unpaid) {
    const matching = recent.find((h) =>
      ((h.randomRolls ?? []) as RollRow[]).some(
        (r) => r.userId === userId && r.playerId === unpaid.playerId
      )
    );
    if (matching) {
      const mine = ((matching.randomRolls ?? []) as RollRow[]).find(
        (r) => r.userId === userId && r.playerId === unpaid.playerId
      )!;
      return {
        roundIndex: matching.roundIndex,
        slotIndex: matching.slotIndex,
        playerId: unpaid.playerId,
        deductionAmount: Math.max(0, mine.deductionAmount ?? unpaid.purchasePrice),
      };
    }
    if (unpaid.draftSlotIndex == null) return null;
    return {
      roundIndex: currentRound,
      slotIndex: unpaid.draftSlotIndex,
      playerId: unpaid.playerId,
      deductionAmount: Math.max(0, unpaid.purchasePrice),
    };
  }

  const exact = await prisma.draftRoundHistory.findUnique({
    where: { roomId_roundIndex: { roomId, roundIndex: currentRound } },
  });
  const pool = exact ? [exact, ...recent.filter((h) => h.id !== exact.id)] : recent;
  for (const h of pool) {
    const mine = ((h.randomRolls ?? []) as RollRow[]).find((r) => r.userId === userId);
    if (!mine?.playerId) continue;
    return {
      roundIndex: h.roundIndex,
      slotIndex: h.slotIndex,
      playerId: mine.playerId,
      deductionAmount: Math.max(0, mine.deductionAmount ?? 0),
    };
  }

  return null;
}

/** Re-attach anyone still holding an unpaid roll so the draft cannot skip them. */
async function resyncPendingReleases(roomId: string) {
  const unpaid = await prisma.squadPlayer.findMany({
    where: {
      draftAcquisition: UNPAID_ROLL_ACQUISITION,
      user: { roomId },
    },
    select: { userId: true },
  });
  const ids = [...new Set(unpaid.map((u) => u.userId))];
  if (ids.length === 0) return false;
  await prisma.heroDraftState.update({
    where: { roomId },
    data: { status: "awaiting_releases", pendingReleaseUserIds: ids },
  });
  return true;
}

async function countUnpaidRollsInRoom(roomId: string) {
  return prisma.squadPlayer.count({
    where: {
      draftAcquisition: UNPAID_ROLL_ACQUISITION,
      user: { roomId },
    },
  });
}

/** All unpaid random-roll debts for a manager (purchasePrice is the owed amount). */
export async function loadUnpaidRollDebts(userId: string) {
  const rows = await prisma.squadPlayer.findMany({
    where: { userId, draftAcquisition: UNPAID_ROLL_ACQUISITION },
    orderBy: { draftSlotIndex: "asc" },
    select: {
      id: true,
      playerId: true,
      purchasePrice: true,
      draftSlotIndex: true,
    },
  });
  return rows.map((r) => ({
    squadPlayerId: r.id,
    playerId: r.playerId,
    deductionAmount: Math.max(0, r.purchasePrice),
    slotIndex: r.draftSlotIndex,
  }));
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
        minPlayerRating: room.heroDraftSettings?.minPlayerRating ?? 45,
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
  // Pool seeding is done at draft start; avoid blocking every round (esp. releases).
  if (!legendReadyRooms.has(room.id)) {
    await ensureHeroDraftPool(room.id);
  }
  const state = room.heroDraftState!;
  if (state.status !== "in_progress") {
    throw new Error("Draft is not in progress");
  }
  if (state.pendingReleaseUserIds.length > 0) {
    throw new Error("Waiting for forced player releases");
  }
  // Never start a new round while unpaid rolls still sit on squads (prevents stacking debts).
  if ((await countUnpaidRollsInRoom(room.id)) > 0) {
    await resyncPendingReleases(room.id);
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
  const minRating = effectiveDraftMinRating(
    state.minPlayerRating ?? 45,
    state.goldenRoundMinRating,
    isGolden
  );

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
    minRating,
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
  // Opening bid: turn holder (or whoever opens) chooses any amount — no market-value floor

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

  const stuckClosed = await prisma.heroDraftState.findMany({
    where: {
      status: "in_progress",
      currentRoundTurnUserId: null,
      currentRoundHighestBidderId: { not: null },
      currentAuctionedPlayerId: { not: null },
    },
    include: { room: { select: { code: true } } },
    take: 10,
  });
  for (const s of stuckClosed) {
    try {
      if (s.currentRoundHighestBidderId == null || s.currentRoundHighestBid == null) continue;
      if (s.currentSlotIndex != null && s.filledSlotIndexes.includes(s.currentSlotIndex)) {
        continue;
      }
      await resolveRoundAuction(
        s.room.code,
        s.currentRoundHighestBidderId,
        s.currentRoundHighestBid
      );
    } catch (err) {
      console.error("Hero draft stuck-round recover failed:", err);
    }
  }

  const awaiting = await prisma.heroDraftState.findMany({
    where: { status: "awaiting_releases" },
    include: { room: { select: { code: true } } },
    take: 10,
  });
  for (const s of awaiting) {
    try {
      if (s.pendingReleaseUserIds.length === 0) {
        // pending was cleared too early while unpaid rolls still sit on squads
        const restored = await resyncPendingReleases(s.roomId);
        if (restored) continue;
        await finishRoundAdvance(s.room.code, s.filledSlotIndexes);
      } else {
        // Keep pending in sync with real unpaid squad rows
        await resyncPendingReleases(s.roomId);
      }
    } catch (err) {
      console.error("Hero draft awaiting-releases recover failed:", err);
    }
  }
}

async function resolveRoundAuction(
  roomCode: string,
  winnerId: string,
  winningBid: number
) {
  const hint = await loadRoomDraft(roomCode);
  return withHeroDraftLock(hint.id, () =>
    resolveRoundAuctionLocked(roomCode, winnerId, winningBid)
  );
}

async function resolveRoundAuctionLocked(
  roomCode: string,
  winnerId: string,
  winningBid: number
) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;

  if (state.status === "awaiting_releases") {
    return { ok: true as const, awaitingReleases: true };
  }

  // Stale recover/pass must not charge a later round with an old winner/price.
  if (
    state.currentRoundHighestBidderId !== winnerId ||
    state.currentRoundHighestBid !== winningBid
  ) {
    return { ok: true as const, alreadyResolved: true };
  }

  const slotIndex = state.currentSlotIndex;
  const playerId = state.currentAuctionedPlayerId;
  if (slotIndex == null || !playerId) {
    throw new Error("No auction in progress to resolve");
  }
  if (state.filledSlotIndexes.includes(slotIndex)) {
    if (state.pendingReleaseUserIds.length > 0) {
      await prisma.heroDraftState.update({
        where: { roomId: room.id },
        data: {
          status: "awaiting_releases",
          currentRoundTurnUserId: null,
          currentRoundTurnExpiresAt: null,
        },
      });
      return { ok: true as const, awaitingReleases: true };
    }
    return { ok: true as const, alreadyResolved: true };
  }

  const existingHistory = await prisma.draftRoundHistory.findUnique({
    where: {
      roomId_roundIndex: { roomId: room.id, roundIndex: state.currentRound },
    },
  });
  if (existingHistory) {
    if (state.currentAuctionedPlayerId !== playerId) {
      return { ok: true as const, alreadyResolved: true };
    }
    const filled = state.filledSlotIndexes.includes(slotIndex)
      ? state.filledSlotIndexes
      : [...state.filledSlotIndexes, slotIndex];
    if (state.pendingReleaseUserIds.length > 0) {
      await prisma.heroDraftState.update({
        where: { roomId: room.id },
        data: {
          status: "awaiting_releases",
          filledSlotIndexes: filled,
          currentRoundTurnUserId: null,
          currentRoundTurnExpiresAt: null,
        },
      });
      const rolls = existingHistory.randomRolls as Array<{
        userId: string;
        playerId: string;
        deductionAmount: number;
      }>;
      for (const uid of state.pendingReleaseUserIds) {
        const roll = rolls.find((r) => r.userId === uid);
        const user = room.users.find((u) => u.id === uid);
        await emitToRoom(room.code, "randomRoll:insufficientFunds", {
          userId: uid,
          requiredAmount: roll?.deductionAmount ?? 0,
          budget: user?.budget ?? 0,
          playerId: roll?.playerId ?? "",
          roundIndex: state.currentRound,
        });
      }
      return { ok: true as const, awaitingReleases: true };
    }
    return finishRoundAdvance(room.code, filled);
  }

  const template = (state.slotTemplate as DraftSlotDef[]) ?? DEFAULT_SLOT_TEMPLATE;
  const slot = template[slotIndex];
  const isGolden = state.goldenRoundIndex === state.currentRound;
  const lastBids =
    state.currentRoundLastBids && typeof state.currentRoundLastBids === "object"
      ? (state.currentRoundLastBids as Record<string, number>)
      : {};
  const weights = (state.tierWeights as TierWeights) ?? DEFAULT_TIER_WEIGHTS;
  const passiveRatio = room.heroDraftSettings?.passiveDeductionRatio ?? 0.5;

  // Charge winner + assign squad slot (skip if a previous resolve already did this)
  const winnerAlreadyOwns = await prisma.squadPlayer.findFirst({
    where: { userId: winnerId, playerId },
  });
  if (!winnerAlreadyOwns) {
    await prisma.$transaction(async (tx) => {
      const owned = await tx.squadPlayer.findFirst({
        where: { userId: winnerId, playerId },
      });
      if (owned) return;
      const charged = await tryDebitBudget(tx, winnerId, winningBid);
      if (!charged) {
        throw new Error("Winner no longer has enough budget for this bid");
      }
      await tx.player.update({
        where: { id: playerId },
        data: { status: "owned" },
      });
      await tx.squadPlayer.create({
        data: {
          userId: winnerId,
          playerId,
          isStarting: slot.isStarting,
          purchasePrice: winningBid,
          draftSlotIndex: slotIndex,
          draftAcquisition: "auction",
        },
      });
    });
  }

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

    const existingAtSlot = await prisma.squadPlayer.findFirst({
      where: { userId: loser.id, draftSlotIndex: slotIndex },
    });
    if (existingAtSlot) {
      usedIds.add(existingAtSlot.playerId);
      const owned = await prisma.player.findUnique({ where: { id: existingAtSlot.playerId } });
      randomRolls.push({
        userId: loser.id,
        playerId: existingAtSlot.playerId,
        tier: owned?.tier ?? "GOLD",
        rating: owned?.baseRating ?? 0,
        lastBidAmount: deduction.lastBidAmount,
        deductionAmount: deduction.amount,
        deductionType: deduction.deductionType,
      });
      const unpaid =
        existingAtSlot.draftAcquisition === UNPAID_ROLL_ACQUISITION ||
        state.pendingReleaseUserIds.includes(loser.id);
      if (unpaid) {
        pendingReleases.push(loser.id);
        const freshUser = await prisma.user.findUniqueOrThrow({ where: { id: loser.id } });
        await emitToRoom(room.code, "randomRoll:insufficientFunds", {
          userId: loser.id,
          requiredAmount: deduction.amount,
          budget: freshUser.budget,
          playerId: existingAtSlot.playerId,
          roundIndex: state.currentRound,
        });
      }
      continue;
    }

    const picked = pickPlayerForSlot({
      pool: available
        .filter((p) => !usedIds.has(p.id))
        .map((p) => ({ ...p, tier: p.tier as PlayerTier })),
      slot,
      weights,
      minRating: effectiveDraftMinRating(
        state.minPlayerRating ?? 45,
        state.goldenRoundMinRating,
        isGolden
      ),
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
    let unpaid = freshUser.budget < deduction.amount;
    await prisma.$transaction(async (tx) => {
      const already = await tx.squadPlayer.findFirst({
        where: { userId: loser.id, draftSlotIndex: slotIndex },
      });
      if (already) {
        unpaid = already.draftAcquisition === UNPAID_ROLL_ACQUISITION;
        return;
      }
      const charged = await tryDebitBudget(tx, loser.id, deduction.amount);
      unpaid = !charged;
      await tx.player.update({
        where: { id: picked.id },
        data: { status: "owned" },
      });
      await tx.squadPlayer.create({
        data: {
          userId: loser.id,
          playerId: picked.id,
          isStarting: slot.isStarting,
          purchasePrice: deduction.amount,
          draftSlotIndex: slotIndex,
          draftAcquisition: unpaid ? UNPAID_ROLL_ACQUISITION : PAID_ROLL_ACQUISITION,
        },
      });
    });
    if (unpaid) {
      pendingReleases.push(loser.id);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: loser.id } });
      await emitToRoom(room.code, "randomRoll:insufficientFunds", {
        userId: loser.id,
        requiredAmount: deduction.amount,
        budget: after.budget,
        playerId: picked.id,
        roundIndex: state.currentRound,
      });
    }
    randomRolls.push({
      userId: loser.id,
      playerId: picked.id,
      tier: picked.tier,
      rating: picked.baseRating,
      lastBidAmount: deduction.lastBidAmount,
      deductionAmount: deduction.amount,
      deductionType: deduction.deductionType,
    });

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
  }).catch((err: { code?: string }) => {
    if (err?.code !== "P2002") throw err;
  });

  const filled = [...state.filledSlotIndexes, slotIndex];

  await emitToRoom(room.code, "auction:closed", {
    roundIndex: state.currentRound,
    winnerId,
    winningBid,
    playerId,
    slotIndex,
  });
  await emitToRoom(room.code, "squad:updated", { reason: "hero_draft_round" });
  await notifyBudgetUpdated(room.code, { reason: "hero_draft_round" });

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
  const hint = await loadRoomDraft(roomCode);
  return withHeroDraftLock(hint.id, () =>
    finishRoundAdvanceLocked(roomCode, filledSlotIndexes)
  );
}

async function finishRoundAdvanceLocked(roomCode: string, filledSlotIndexes: number[]) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;

  // Block advance while anyone still owes an unpaid random roll.
  if ((await countUnpaidRollsInRoom(room.id)) > 0) {
    await resyncPendingReleases(room.id);
    return;
  }

  const filled = [...new Set(filledSlotIndexes)];
  const alreadyFilled =
    filled.every((i) => state.filledSlotIndexes.includes(i)) &&
    state.filledSlotIndexes.length >= filled.length;

  if (alreadyFilled) {
    const drainReleases =
      state.status === "awaiting_releases" && state.pendingReleaseUserIds.length === 0;
    if (!drainReleases) {
      if (state.status === "completed" || state.status === "trade_window") return;
      if (state.currentAuctionedPlayerId) return;
      if (filled.length >= TOTAL_DRAFT_SLOTS) return completeDraft(room.code);
      if (state.status === "in_progress") return beginRound(room.code);
      return;
    }
  }

  const nextPointer = advanceTurnPointer(state.turnQueuePointer, state.turnQueue.length);
  const nextRound = state.currentRound + 1;

  await emitToRoom(room.code, "round:completed", {
    roundIndex: state.currentRound,
    filledSlotIndexes,
    nextRound,
  });

  if (filled.length >= TOTAL_DRAFT_SLOTS) {
    await prisma.heroDraftState.update({
      where: { roomId: room.id },
      data: {
        status: "in_progress",
        filledSlotIndexes: filled,
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
      filledSlotIndexes: filled,
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
  const hint = await loadRoomDraft(roomCode);
  return withHeroDraftLock(hint.id, () =>
    forceReleasePlayerLocked(roomCode, userId, releaseSquadPlayerId)
  );
}

async function forceReleasePlayerLocked(
  roomCode: string,
  userId: string,
  releaseSquadPlayerId: string
) {
  const room = await loadRoomDraft(roomCode);
  const state = room.heroDraftState!;
  if (!state.pendingReleaseUserIds.includes(userId)) {
    throw new Error("You do not owe a release");
  }

  const myRoll = await loadPendingReleaseRoll(room.id, userId, state.currentRound);
  if (!myRoll) {
    throw new Error("Could not find this round's unpaid roll — refresh and try again");
  }

  const squadEntry = await prisma.squadPlayer.findFirst({
    where: { id: releaseSquadPlayerId, userId },
    include: { player: true },
  });
  if (!squadEntry) throw new Error("Squad player not found");
  // Cannot release the unpaid roll from this round until they can afford it —
  // they must release an earlier player
  if (squadEntry.draftSlotIndex === myRoll.slotIndex) {
    throw new Error("Release an earlier player, not this round's roll");
  }
  if (
    squadEntry.draftAcquisition === UNPAID_ROLL_ACQUISITION ||
    squadEntry.playerId === myRoll.playerId
  ) {
    throw new Error("Release an earlier player, not this round's roll");
  }

  const refund = squadEntry.purchasePrice;
  if (refund <= 0) {
    throw new Error("This player has no budget to recover — pick someone you paid for");
  }
  const vacatedSlot = squadEntry.draftSlotIndex!;
  const template = (state.slotTemplate as DraftSlotDef[]) ?? DEFAULT_SLOT_TEMPLATE;
  const vacatedDef = template[vacatedSlot];
  if (!vacatedDef) throw new Error("Invalid squad slot for release");

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

  const outcome = await prisma.$transaction(async (tx) => {
    await lockHeroDraftRoom(tx, room.id);

    const liveState = await tx.heroDraftState.findUniqueOrThrow({
      where: { roomId: room.id },
    });
    if (!liveState.pendingReleaseUserIds.includes(userId)) {
      throw new Error("You do not owe a release");
    }

    const stillThere = await tx.squadPlayer.findFirst({
      where: { id: squadEntry.id, userId },
    });
    if (!stillThere) throw new Error("Squad player not found");

    await tx.squadPlayer.delete({ where: { id: squadEntry.id } });
    await tx.player.update({
      where: { id: squadEntry.playerId },
      data: { status: "available" },
    });
    await creditBudget(tx, userId, refund);
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
        roundIndex: myRoll.roundIndex,
        releasedPlayerId: squadEntry.playerId,
        refundAmount: refund,
        downgradeSlotIndex: vacatedSlot,
        downgradePlayerId: downgrade.id,
      },
    });

    // Settle unpaid rolls only when budget covers the FULL debt.
    // Partial-paying one roll (then still owing another) was draining budget
    // and immediately asking for more releases.
    const unpaidSlots = await tx.squadPlayer.findMany({
      where: { userId, draftAcquisition: UNPAID_ROLL_ACQUISITION },
      orderBy: { draftSlotIndex: "asc" },
    });
    const totalOwed = unpaidSlots.reduce((sum, s) => sum + Math.max(0, s.purchasePrice), 0);
    const userAfter = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    if (unpaidSlots.length === 0) {
      const remaining = liveState.pendingReleaseUserIds.filter((id) => id !== userId);
      await tx.heroDraftState.update({
        where: { roomId: room.id },
        data: { status: "awaiting_releases", pendingReleaseUserIds: remaining },
      });
      return {
        stillOwes: false as const,
        waitingOthers: remaining.length > 0,
        budget: userAfter.budget,
        remaining,
        filledSlotIndexes: liveState.filledSlotIndexes,
        totalOwed: 0,
      };
    }

    if (userAfter.budget < totalOwed) {
      await tx.heroDraftState.update({
        where: { roomId: room.id },
        data: { status: "awaiting_releases" },
      });
      return {
        stillOwes: true as const,
        waitingOthers: true,
        budget: userAfter.budget,
        remaining: liveState.pendingReleaseUserIds,
        filledSlotIndexes: liveState.filledSlotIndexes,
        totalOwed,
      };
    }

    for (const slot of unpaidSlots) {
      const owed = Math.max(0, slot.purchasePrice);
      if (owed > 0) {
        const charged = await tryDebitBudget(tx, userId, owed);
        if (!charged) {
          // Shouldn't happen after the total check; leave unpaid and ask again.
          const mid = await tx.user.findUniqueOrThrow({ where: { id: userId } });
          await tx.heroDraftState.update({
            where: { roomId: room.id },
            data: { status: "awaiting_releases" },
          });
          return {
            stillOwes: true as const,
            waitingOthers: true,
            budget: mid.budget,
            remaining: liveState.pendingReleaseUserIds,
            filledSlotIndexes: liveState.filledSlotIndexes,
            totalOwed,
          };
        }
      }
      await tx.squadPlayer.update({
        where: { id: slot.id },
        data: { draftAcquisition: PAID_ROLL_ACQUISITION },
      });
    }

    const remaining = liveState.pendingReleaseUserIds.filter((id) => id !== userId);
    await tx.heroDraftState.update({
      where: { roomId: room.id },
      data: {
        status: "awaiting_releases",
        pendingReleaseUserIds: remaining,
      },
    });
    const paidUser = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      stillOwes: false as const,
      waitingOthers: remaining.length > 0,
      budget: paidUser.budget,
      remaining,
      filledSlotIndexes: liveState.filledSlotIndexes,
      totalOwed: 0,
    };
  });

  await emitToRoom(room.code, "squadSlot:downgraded", {
    userId,
    vacatedSlotIndex: vacatedSlot,
    releasedPlayerId: squadEntry.playerId,
    downgradePlayerId: downgrade.id,
    refundAmount: refund,
  });
  await emitToRoom(room.code, "squad:updated", { userId });
  await notifyBudgetUpdated(room.code, { userId, budget: outcome.budget, reason: "hero_draft_release" });

  if (outcome.stillOwes) {
    await emitToRoom(room.code, "randomRoll:insufficientFunds", {
      userId,
      requiredAmount: outcome.totalOwed,
      budget: outcome.budget,
      playerId: myRoll.playerId,
      roundIndex: myRoll.roundIndex,
    });
    return { stillOwes: true as const };
  }

  if (outcome.waitingOthers) {
    return { stillOwes: false as const, waitingOthers: true as const };
  }

  // Do not await beginRound / pool ensure here — that can hang the Release button
  // for a long time. pendingReleaseUserIds is empty and status stays
  // awaiting_releases so the 2s watcher advances the round.
  void finishRoundAdvance(room.code, outcome.filledSlotIndexes).catch((err) => {
    console.error("Hero draft post-release advance failed:", err);
  });
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

  if (state.status === "awaiting_releases" && state.pendingReleaseUserIds.length === 0) {
    return finishRoundAdvance(roomCode, state.filledSlotIndexes);
  }

  if (state.status === "awaiting_releases" || state.pendingReleaseUserIds.length > 0) {
    const names = room.users
      .filter((u) => state.pendingReleaseUserIds.includes(u.id))
      .map((u) => u.displayName)
      .join(", ");
    throw new Error(
      `Waiting for ${names || "a manager"} to release a squad player and recover budget. The draft cannot advance until they pick someone to downgrade to Gold.`
    );
  }

  if (state.currentRoundTurnUserId) {
    return heroDraftPass(roomCode, state.currentRoundTurnUserId, true);
  }

  // Bidding already closed (no current turn) but the round never resolved —
  // finish assigning the winner / random rolls / forced releases.
  if (
    state.status === "in_progress" &&
    state.currentRoundHighestBidderId &&
    state.currentRoundHighestBid != null &&
    state.currentAuctionedPlayerId
  ) {
    return resolveRoundAuction(
      roomCode,
      state.currentRoundHighestBidderId,
      state.currentRoundHighestBid
    );
  }

  throw new Error("No active turn to advance");
}
