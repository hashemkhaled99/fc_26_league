import { prisma } from "@/lib/prisma";
import { computeStandings } from "@/lib/league/fixtures";

export const AWARD_DEFS = [
  { type: "champion", title: "Champion", emoji: "🏆", blurb: "Top of the table" },
  { type: "best_attack", title: "Best Attack", emoji: "⚽", blurb: "Most goals scored" },
  { type: "best_defense", title: "Best Defense", emoji: "🛡️", blurb: "Fewest goals conceded" },
  { type: "expensive_deal", title: "Most Expensive Deal", emoji: "💰", blurb: "Biggest auction of the season" },
  { type: "trade_king", title: "Trade King", emoji: "🤝", blurb: "Most accepted trades" },
  { type: "hottest_streak", title: "Hottest Streak", emoji: "🔥", blurb: "Longest win streak" },
  { type: "worst_deal", title: "Worst Deal", emoji: "📉", blurb: "Biggest resale loss" },
  { type: "luckiest", title: "Luckiest of the Season", emoji: "🎴", blurb: "Most cards played" },
] as const;

export type AwardType = (typeof AWARD_DEFS)[number]["type"];

function pickMax<T>(
  items: T[],
  score: (t: T) => number,
  tieBreak?: (t: T) => string
): T | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return (tieBreak?.(a) ?? "").localeCompare(tieBreak?.(b) ?? "");
  })[0];
}

function pickMin<T>(
  items: T[],
  score: (t: T) => number,
  minPlayed = 1
): T | null {
  const eligible = items.filter((t) => (t as { played?: number }).played === undefined || (t as { played: number }).played >= minPlayed);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => score(a) - score(b))[0];
}

export async function calculateSeasonAwards(roomId: string, season: number) {
  const standings = await computeStandings(roomId, season);
  const users = await prisma.user.findMany({
    where: { roomId },
    select: { id: true, teamName: true, bestStreakSeason: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const awards: Array<{ type: string; userId: string; value: string }> = [];

  const champ = standings[0];
  if (champ && champ.played > 0) {
    awards.push({
      type: "champion",
      userId: champ.userId,
      value: `${champ.points} pts · ${champ.teamName}`,
    });
  }

  const attack = pickMax(
    standings.filter((s) => s.played > 0),
    (s) => s.gf,
    (s) => s.teamName
  );
  if (attack) {
    awards.push({
      type: "best_attack",
      userId: attack.userId,
      value: `${attack.gf} goals`,
    });
  }

  const defense = pickMin(
    standings.filter((s) => s.played > 0),
    (s) => s.ga
  );
  if (defense) {
    awards.push({
      type: "best_defense",
      userId: defense.userId,
      value: `${defense.ga} conceded`,
    });
  }

  const closedDeals = await prisma.auction.findMany({
    where: { roomId, status: "closed" },
    include: { player: true },
    orderBy: { currentBid: "desc" },
    take: 50,
  });
  // Prefer deals from this season's window: use createdAt after season start is hard —
  // use all closed in room for dynasty; filter by season via Match season is unrelated.
  // Store season on awards only; deals are room-lifetime for now.
  const topDeal = closedDeals[0];
  if (topDeal?.currentBidderId) {
    awards.push({
      type: "expensive_deal",
      userId: topDeal.currentBidderId,
      value: `${topDeal.player.name} · ${(topDeal.currentBid / 1_000_000).toFixed(0)}M`,
    });
  }

  const trades = await prisma.tradeRequest.findMany({
    where: { roomId, status: "accepted" },
  });
  const tradeCount = new Map<string, number>();
  for (const t of trades) {
    tradeCount.set(t.fromUserId, (tradeCount.get(t.fromUserId) ?? 0) + 1);
    tradeCount.set(t.toUserId, (tradeCount.get(t.toUserId) ?? 0) + 1);
  }
  const tradeKingId = pickMax(
    Array.from(tradeCount.entries()).map(([userId, count]) => ({ userId, count })),
    (x) => x.count
  );
  if (tradeKingId && tradeKingId.count > 0) {
    awards.push({
      type: "trade_king",
      userId: tradeKingId.userId,
      value: `${tradeKingId.count} trades`,
    });
  }

  const hot = pickMax(users, (u) => u.bestStreakSeason, (u) => u.teamName);
  if (hot && hot.bestStreakSeason > 0) {
    awards.push({
      type: "hottest_streak",
      userId: hot.id,
      value: `${hot.bestStreakSeason} wins`,
    });
  }

  // Worst resale: sold for less than what they paid
  let worst: { userId: string; loss: number; label: string } | null = null;
  const resales = closedDeals.filter((a) => a.isResale && a.sellerId);
  for (const sale of resales) {
    const bought = await prisma.auction.findFirst({
      where: {
        playerId: sale.playerId,
        status: "closed",
        currentBidderId: sale.sellerId!,
        id: { not: sale.id },
      },
      orderBy: { createdAt: "desc" },
    });
    const paid = bought?.currentBid ?? sale.player.marketValue;
    const loss = paid - sale.currentBid;
    if (loss > 0 && (!worst || loss > worst.loss)) {
      worst = {
        userId: sale.sellerId!,
        loss,
        label: `${sale.player.name} · -${(loss / 1_000_000).toFixed(0)}M`,
      };
    }
  }
  if (worst) {
    awards.push({ type: "worst_deal", userId: worst.userId, value: worst.label });
  }

  const cardUses = await prisma.card.groupBy({
    by: ["ownerId"],
    where: { roomId, used: true, ownerId: { not: null } },
    _count: { _all: true },
  });
  const luck = pickMax(
    cardUses.map((c) => ({ userId: c.ownerId!, count: c._count._all })),
    (x) => x.count
  );
  if (luck && luck.count > 0) {
    awards.push({
      type: "luckiest",
      userId: luck.userId,
      value: `${luck.count} cards used`,
    });
  }

  // Persist (replace if re-run)
  await prisma.award.deleteMany({ where: { roomId, season } });
  if (awards.length > 0) {
    await prisma.award.createMany({
      data: awards.map((a) => ({
        roomId,
        season,
        type: a.type,
        userId: a.userId,
        value: a.value,
      })),
    });
  }

  return awards.map((a) => ({
    ...a,
    teamName: userMap[a.userId]?.teamName ?? "Unknown",
    def: AWARD_DEFS.find((d) => d.type === a.type) ?? null,
  }));
}

/** Pay 1st / 2nd (and scaled lower) league prizes from standings. */
export async function payLeaguePrizes(roomId: string, season: number) {
  const settings = await prisma.roomSettings.findUnique({ where: { roomId } });
  const first = settings?.leaguePrizeFirst ?? 50_000_000;
  const second = settings?.leaguePrizeSecond ?? 25_000_000;
  const standings = await computeStandings(roomId, season);

  const payouts: Array<{ userId: string; teamName: string; amount: number; place: number }> = [];

  for (let i = 0; i < standings.length; i++) {
    const row = standings[i];
    if (row.played === 0) continue;
    let amount = 0;
    if (i === 0) amount = first;
    else if (i === 1) amount = second;
    else if (i === 2) amount = Math.floor(second * 0.5);
    else amount = Math.floor(second * 0.2);

    if (amount <= 0) continue;
    await prisma.user.update({
      where: { id: row.userId },
      data: { budget: { increment: amount } },
    });
    payouts.push({
      userId: row.userId,
      teamName: row.teamName,
      amount,
      place: i + 1,
    });
  }

  return payouts;
}
