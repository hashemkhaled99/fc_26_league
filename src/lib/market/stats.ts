import { prisma } from "@/lib/prisma";

type LoanRow = {
  id: string;
  lenderId: string;
  borrowerId: string;
  playerId: string;
  loanFee: number;
  fixturesTotal: number;
  fixturesPlayed: number;
  status: string;
  createdAt: Date;
};

async function loadLoanHistory(roomId: string): Promise<LoanRow[]> {
  try {
    return await prisma.loan.findMany({
      where: { roomId, status: { in: ["returned", "active"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  } catch (err) {
    console.warn("Loan stats unavailable (run prisma db push):", err);
    return [];
  }
}

export async function getMarketHistoryStats(roomId: string) {
  const closed = await prisma.auction.findMany({
    where: {
      roomId,
      status: "closed",
      currentBidderId: { not: null },
    },
    include: { player: true },
    orderBy: { createdAt: "desc" },
  });

  const acceptedTrades = await prisma.tradeRequest.findMany({
    where: { roomId, status: "accepted" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const userIds = new Set<string>();
  for (const a of closed) {
    if (a.currentBidderId) userIds.add(a.currentBidderId);
    if (a.sellerId) userIds.add(a.sellerId);
  }
  for (const t of acceptedTrades) {
    userIds.add(t.fromUserId);
    userIds.add(t.toUserId);
  }

  const completedLoans = await loadLoanHistory(roomId);
  for (const l of completedLoans) {
    userIds.add(l.lenderId);
    userIds.add(l.borrowerId);
  }

  const users =
    userIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, displayName: true, teamName: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const deals = closed.map((a) => ({
    id: a.id,
    type: "auction" as const,
    playerName: a.player.name,
    position: a.player.position,
    rating: a.player.baseRating,
    realTeam: a.player.realTeam,
    price: a.currentBid,
    isResale: a.isResale,
    winnerId: a.currentBidderId!,
    winnerTeam: userMap.get(a.currentBidderId!)?.teamName ?? "?",
    sellerTeam: a.sellerId ? userMap.get(a.sellerId)?.teamName ?? null : null,
    at: a.createdAt.toISOString(),
  }));

  const totalVolume = deals.reduce((sum, d) => sum + d.price, 0);
  const avgPrice = deals.length > 0 ? Math.round(totalVolume / deals.length) : 0;

  const byPositionMap = new Map<
    string,
    { position: string; count: number; totalVolume: number }
  >();
  for (const d of deals) {
    const row = byPositionMap.get(d.position) ?? {
      position: d.position,
      count: 0,
      totalVolume: 0,
    };
    row.count += 1;
    row.totalVolume += d.price;
    byPositionMap.set(d.position, row);
  }
  const byPosition = [...byPositionMap.values()]
    .map((r) => ({
      ...r,
      avgPrice: r.count > 0 ? Math.round(r.totalVolume / r.count) : 0,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume);

  const spenderMap = new Map<string, { userId: string; totalSpent: number; dealsWon: number }>();
  for (const d of deals) {
    const row = spenderMap.get(d.winnerId) ?? {
      userId: d.winnerId,
      totalSpent: 0,
      dealsWon: 0,
    };
    row.totalSpent += d.price;
    row.dealsWon += 1;
    spenderMap.set(d.winnerId, row);
  }
  const topSpenders = [...spenderMap.values()]
    .map((r) => ({
      ...r,
      teamName: userMap.get(r.userId)?.teamName ?? "?",
      displayName: userMap.get(r.userId)?.displayName ?? "?",
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  const resaleDeals = deals.filter((d) => d.isResale);
  const sellerMap = new Map<string, { userId: string; totalEarned: number; sales: number }>();
  for (const a of closed) {
    if (!a.isResale || !a.sellerId) continue;
    const row = sellerMap.get(a.sellerId) ?? {
      userId: a.sellerId,
      totalEarned: 0,
      sales: 0,
    };
    row.totalEarned += a.currentBid;
    row.sales += 1;
    sellerMap.set(a.sellerId, row);
  }
  const topSellers = [...sellerMap.values()]
    .map((r) => ({
      ...r,
      teamName: userMap.get(r.userId)?.teamName ?? "?",
    }))
    .sort((a, b) => b.totalEarned - a.totalEarned)
    .slice(0, 10);

  const biggestDeals = [...deals]
    .sort((a, b) => b.price - a.price)
    .slice(0, 10);

  const tradeHistory = acceptedTrades.map((t) => ({
    id: t.id,
    type: "trade" as const,
    fromTeam: userMap.get(t.fromUserId)?.teamName ?? "?",
    toTeam: userMap.get(t.toUserId)?.teamName ?? "?",
    playersOffered: t.offeredPlayerIds.length,
    playersRequested: t.requestedPlayerIds.length,
    cashAdjustment: t.cashAdjustment,
    at: t.createdAt.toISOString(),
  }));

  const loanPlayerIds = [...new Set(completedLoans.map((l) => l.playerId))];
  const loanPlayers =
    loanPlayerIds.length > 0
      ? await prisma.player.findMany({
          where: { id: { in: loanPlayerIds } },
          select: { id: true, name: true, position: true, baseRating: true },
        })
      : [];
  const playerMap = new Map(loanPlayers.map((p) => [p.id, p]));

  const loanHistory = completedLoans.map((l) => ({
    id: l.id,
    playerName: playerMap.get(l.playerId)?.name ?? "?",
    position: playerMap.get(l.playerId)?.position ?? "?",
    rating: playerMap.get(l.playerId)?.baseRating ?? 0,
    lenderTeam: userMap.get(l.lenderId)?.teamName ?? "?",
    borrowerTeam: userMap.get(l.borrowerId)?.teamName ?? "?",
    loanFee: l.loanFee,
    fixturesTotal: l.fixturesTotal,
    fixturesPlayed: l.fixturesPlayed,
    status: l.status,
    at: l.createdAt.toISOString(),
  }));

  return {
    summary: {
      totalDeals: deals.length,
      totalVolume,
      avgPrice,
      resaleCount: resaleDeals.length,
      tradeCount: acceptedTrades.length,
      activeLoans: completedLoans.filter((l) => l.status === "active").length,
    },
    recentDeals: deals.slice(0, 30),
    biggestDeals,
    byPosition,
    topSpenders,
    topSellers,
    tradeHistory,
    loanHistory,
  };
}
