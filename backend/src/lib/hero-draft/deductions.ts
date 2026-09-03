/**
 * Pure deduction math for Hero Draft random rolls (section 3.2 step 6).
 */

export type DeductionType = "OWN_LAST_BID" | "HALF_FINAL_PRICE";

export type RandomRollDeduction = {
  amount: number;
  deductionType: DeductionType;
  lastBidAmount: number | null;
};

/**
 * Cost for a non-winner's random roll.
 * - Placed ≥1 bid then passed → pay own last bid
 * - Never bid (pure passer) → pay passiveRatio × winningBid
 */
export function computeRandomRollDeduction(opts: {
  lastBidAmount: number | null;
  winningBid: number;
  passiveDeductionRatio?: number;
}): RandomRollDeduction {
  const ratio = opts.passiveDeductionRatio ?? 0.5;
  if (opts.lastBidAmount != null && opts.lastBidAmount > 0) {
    return {
      amount: opts.lastBidAmount,
      deductionType: "OWN_LAST_BID",
      lastBidAmount: opts.lastBidAmount,
    };
  }
  return {
    amount: Math.floor(opts.winningBid * ratio),
    deductionType: "HALF_FINAL_PRICE",
    lastBidAmount: null,
  };
}

export type RecapStats = {
  biggestSpender: { userId: string; amount: number } | null;
  luckiest: { userId: string; avgRating: number } | null;
  unluckiest: { userId: string; avgRating: number } | null;
  auctionKing: { userId: string; wins: number } | null;
  bestValue: { userId: string; playerId: string; ratio: number } | null;
  overpaid: { userId: string; playerId: string; ratio: number } | null;
};

export type RoundHistoryInput = {
  winnerId: string;
  winningBid: number;
  auctionedPlayerId: string;
  auctionedPlayerRating: number;
  randomRolls: Array<{
    userId: string;
    playerId: string;
    rating: number;
  }>;
};

/** Compute draft recap awards from round history. */
export function computeDraftRecap(rounds: RoundHistoryInput[]): RecapStats {
  if (rounds.length === 0) {
    return {
      biggestSpender: null,
      luckiest: null,
      unluckiest: null,
      auctionKing: null,
      bestValue: null,
      overpaid: null,
    };
  }

  let biggestSpender: RecapStats["biggestSpender"] = null;
  const winCounts = new Map<string, number>();
  const rollRatings = new Map<string, number[]>();
  let bestValue: RecapStats["bestValue"] = null;
  let overpaid: RecapStats["overpaid"] = null;

  for (const r of rounds) {
    if (!biggestSpender || r.winningBid > biggestSpender.amount) {
      biggestSpender = { userId: r.winnerId, amount: r.winningBid };
    }
    winCounts.set(r.winnerId, (winCounts.get(r.winnerId) ?? 0) + 1);

    if (r.winningBid > 0) {
      const ratio = r.auctionedPlayerRating / r.winningBid;
      if (!bestValue || ratio > bestValue.ratio) {
        bestValue = {
          userId: r.winnerId,
          playerId: r.auctionedPlayerId,
          ratio,
        };
      }
      if (!overpaid || ratio < overpaid.ratio) {
        overpaid = {
          userId: r.winnerId,
          playerId: r.auctionedPlayerId,
          ratio,
        };
      }
    }

    for (const roll of r.randomRolls) {
      const list = rollRatings.get(roll.userId) ?? [];
      list.push(roll.rating);
      rollRatings.set(roll.userId, list);
    }
  }

  let auctionKing: RecapStats["auctionKing"] = null;
  for (const [userId, wins] of winCounts) {
    if (!auctionKing || wins > auctionKing.wins) {
      auctionKing = { userId, wins };
    }
  }

  let luckiest: RecapStats["luckiest"] = null;
  let unluckiest: RecapStats["unluckiest"] = null;
  for (const [userId, ratings] of rollRatings) {
    if (ratings.length === 0) continue;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (!luckiest || avg > luckiest.avgRating) {
      luckiest = { userId, avgRating: avg };
    }
    if (!unluckiest || avg < unluckiest.avgRating) {
      unluckiest = { userId, avgRating: avg };
    }
  }

  return {
    biggestSpender,
    luckiest,
    unluckiest,
    auctionKing,
    bestValue,
    overpaid,
  };
}
