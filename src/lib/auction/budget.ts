import { prisma } from "@/lib/prisma";
import { SQUAD_LIMIT } from "./constants";

/** Sum of amounts where user is current highest bidder on active auctions */
export async function getCommittedBudget(userId: string): Promise<number> {
  const activeBids = await prisma.auction.findMany({
    where: {
      status: "active",
      currentBidderId: userId,
    },
    select: { currentBid: true },
  });
  return activeBids.reduce((sum, a) => sum + a.currentBid, 0);
}

export async function getSquadCount(userId: string): Promise<number> {
  return prisma.squadPlayer.count({ where: { userId } });
}

export async function getAvailableBudget(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { budget: true },
  });
  if (!user) return 0;
  const committed = await getCommittedBudget(userId);
  return user.budget - committed;
}

export async function canUserBid(
  userId: string,
  amount: number,
  opts?: { roomId?: string; overdraftAllowance?: number; squadLimit?: number }
): Promise<{ ok: boolean; reason?: string }> {
  const available = await getAvailableBudget(userId);
  const allowance = opts?.overdraftAllowance ?? 0;
  if (amount > available + allowance) {
    return {
      ok: false,
      reason: `Budget exceeded. Available: ${available.toLocaleString()}`,
    };
  }

  const squadCount = await getSquadCount(userId);
  const limit = opts?.squadLimit ?? SQUAD_LIMIT;
  if (squadCount >= limit) {
    return { ok: false, reason: `Squad full (${squadCount}/${limit})` };
  }

  return { ok: true };
}

export async function canUserWinAuction(
  userId: string,
  squadLimit = SQUAD_LIMIT
): Promise<{ ok: boolean; reason?: string }> {
  const squadCount = await getSquadCount(userId);
  if (squadCount >= squadLimit) {
    return { ok: false, reason: "Squad full" };
  }
  return { ok: true };
}
