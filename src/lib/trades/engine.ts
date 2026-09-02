import { prisma } from "@/lib/prisma";
import { SQUAD_LIMIT } from "@/lib/auction/constants";
import { getCommittedBudget } from "@/lib/auction/budget";
import { getActiveLoanForPlayer, getEffectiveSquadCount } from "@/lib/loans/engine";

export type TradeValidation =
  | { ok: true }
  | { ok: false; reason: string };

async function ownedPlayerIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.squadPlayer.findMany({
    where: { userId },
    select: { playerId: true },
  });
  return new Set(rows.map((r) => r.playerId));
}

async function playersInAuction(playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const active = await prisma.auction.findMany({
    where: { playerId: { in: playerIds }, status: "active" },
    select: { playerId: true },
  });
  return active.map((a) => a.playerId);
}

/**
 * cashAdjustment > 0 → fromUser pays that amount to toUser
 * cashAdjustment < 0 → toUser pays |amount| to fromUser
 */
export async function validateTrade(params: {
  fromUserId: string;
  toUserId: string;
  offeredPlayerIds: string[];
  requestedPlayerIds: string[];
  cashAdjustment: number;
}): Promise<TradeValidation> {
  const {
    fromUserId,
    toUserId,
    offeredPlayerIds,
    requestedPlayerIds,
    cashAdjustment,
  } = params;

  if (fromUserId === toUserId) {
    return { ok: false, reason: "Cannot trade with yourself" };
  }

  if (offeredPlayerIds.length === 0 && requestedPlayerIds.length === 0 && cashAdjustment === 0) {
    return { ok: false, reason: "Trade is empty" };
  }

  const [fromOwned, toOwned] = await Promise.all([
    ownedPlayerIds(fromUserId),
    ownedPlayerIds(toUserId),
  ]);

  for (const id of offeredPlayerIds) {
    if (!fromOwned.has(id)) {
      return { ok: false, reason: "You no longer own one of the offered players" };
    }
  }
  for (const id of requestedPlayerIds) {
    if (!toOwned.has(id)) {
      return { ok: false, reason: "Partner no longer owns a requested player" };
    }
  }

  const locked = await playersInAuction([...offeredPlayerIds, ...requestedPlayerIds]);
  if (locked.length > 0) {
    return { ok: false, reason: "A player in this trade is currently in an auction" };
  }

  for (const id of [...offeredPlayerIds, ...requestedPlayerIds]) {
    const loan = await getActiveLoanForPlayer(id);
    if (loan) {
      return { ok: false, reason: "A player in this trade is currently on loan" };
    }
  }

  const fromCount = await getEffectiveSquadCount(fromUserId);
  const toCount = await getEffectiveSquadCount(toUserId);
  const fromAfter = fromCount - offeredPlayerIds.length + requestedPlayerIds.length;
  const toAfter = toCount - requestedPlayerIds.length + offeredPlayerIds.length;

  if (fromAfter > SQUAD_LIMIT) {
    return { ok: false, reason: `Your squad would exceed ${SQUAD_LIMIT} players` };
  }
  if (toAfter > SQUAD_LIMIT) {
    return { ok: false, reason: `Their squad would exceed ${SQUAD_LIMIT} players` };
  }

  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUserId }, select: { budget: true } }),
    prisma.user.findUnique({ where: { id: toUserId }, select: { budget: true } }),
  ]);
  if (!fromUser || !toUser) {
    return { ok: false, reason: "User not found" };
  }

  const [fromCommitted, toCommitted] = await Promise.all([
    getCommittedBudget(fromUserId),
    getCommittedBudget(toUserId),
  ]);

  const fromAvailable = fromUser.budget - fromCommitted;
  const toAvailable = toUser.budget - toCommitted;

  if (cashAdjustment > 0 && fromAvailable < cashAdjustment) {
    return { ok: false, reason: "You don't have enough available budget for the cash" };
  }
  if (cashAdjustment < 0 && toAvailable < Math.abs(cashAdjustment)) {
    return { ok: false, reason: "Partner doesn't have enough available budget for the cash" };
  }

  return { ok: true };
}

export async function executeTrade(params: {
  fromUserId: string;
  toUserId: string;
  offeredPlayerIds: string[];
  requestedPlayerIds: string[];
  cashAdjustment: number;
}): Promise<void> {
  const {
    fromUserId,
    toUserId,
    offeredPlayerIds,
    requestedPlayerIds,
    cashAdjustment,
  } = params;

  await prisma.$transaction(async (tx) => {
    // Move offered players → toUser
    for (const playerId of offeredPlayerIds) {
      const entry = await tx.squadPlayer.findUnique({ where: { playerId } });
      if (!entry || entry.userId !== fromUserId) {
        throw new Error("Offer player ownership changed");
      }
      await tx.squadPlayer.update({
        where: { playerId },
        data: { userId: toUserId, isStarting: false },
      });
    }

    // Move requested players → fromUser
    for (const playerId of requestedPlayerIds) {
      const entry = await tx.squadPlayer.findUnique({ where: { playerId } });
      if (!entry || entry.userId !== toUserId) {
        throw new Error("Requested player ownership changed");
      }
      await tx.squadPlayer.update({
        where: { playerId },
        data: { userId: fromUserId, isStarting: false },
      });
    }

    if (cashAdjustment > 0) {
      await tx.user.update({
        where: { id: fromUserId },
        data: { budget: { decrement: cashAdjustment } },
      });
      await tx.user.update({
        where: { id: toUserId },
        data: { budget: { increment: cashAdjustment } },
      });
    } else if (cashAdjustment < 0) {
      const amount = Math.abs(cashAdjustment);
      await tx.user.update({
        where: { id: toUserId },
        data: { budget: { decrement: amount } },
      });
      await tx.user.update({
        where: { id: fromUserId },
        data: { budget: { increment: amount } },
      });
    }
  });
}
