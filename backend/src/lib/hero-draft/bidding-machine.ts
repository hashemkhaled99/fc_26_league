/**
 * Pure sequential bidding state machine for one Hero Draft round.
 */

export type BidRoundState = {
  biddingOrder: string[];
  turnHolderId: string;
  activeBidders: string[];
  passedBidders: string[];
  /** userId → last bid amount this round */
  lastBids: Record<string, number>;
  highestBid: number | null;
  highestBidderId: string | null;
  /** Whose turn to act right now */
  turnUserId: string | null;
  /** True once an opening bid exists (or turn holder auto-passed without opening) */
  openingComplete: boolean;
};

export type BidActionResult =
  | { ok: true; state: BidRoundState; closed: false }
  | {
      ok: true;
      state: BidRoundState;
      closed: true;
      winnerId: string;
      winningBid: number;
    }
  | { ok: false; error: string };

function nextActive(
  biddingOrder: string[],
  active: string[],
  afterUserId: string
): string | null {
  const set = new Set(active);
  if (set.size <= 1) return null;
  const start = biddingOrder.indexOf(afterUserId);
  if (start < 0) return null;
  for (let step = 1; step <= biddingOrder.length; step++) {
    const c = biddingOrder[(start + step) % biddingOrder.length];
    if (set.has(c)) return c;
  }
  return null;
}

/** Initialize a new round: turn holder must act first (open or pass). */
export function initBidRound(opts: {
  biddingOrder: string[];
  turnHolderId: string;
}): BidRoundState {
  const { biddingOrder, turnHolderId } = opts;
  if (!biddingOrder.includes(turnHolderId)) {
    throw new Error("Turn holder missing from bidding order");
  }
  return {
    biddingOrder,
    turnHolderId,
    activeBidders: [...biddingOrder],
    passedBidders: [],
    lastBids: {},
    highestBid: null,
    highestBidderId: null,
    turnUserId: turnHolderId,
    openingComplete: false,
  };
}

export function placeBid(
  state: BidRoundState,
  userId: string,
  amount: number
): BidActionResult {
  if (state.turnUserId !== userId) {
    return { ok: false, error: "Not your turn to bid" };
  }
  if (!state.activeBidders.includes(userId)) {
    return { ok: false, error: "You have already passed this round" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Invalid bid amount" };
  }
  if (state.highestBid != null && amount <= state.highestBid) {
    return { ok: false, error: "Bid must be higher than current highest" };
  }

  const lastBids = { ...state.lastBids, [userId]: amount };
  const next: BidRoundState = {
    ...state,
    lastBids,
    highestBid: amount,
    highestBidderId: userId,
    openingComplete: true,
  };

  const nextUser = nextActive(next.biddingOrder, next.activeBidders, userId);
  if (!nextUser) {
    // Only one active left after this bid shouldn't happen (bidder still active)
    // but if somehow only this user remains, they win.
    return {
      ok: true,
      state: { ...next, turnUserId: null },
      closed: true,
      winnerId: userId,
      winningBid: amount,
    };
  }

  return {
    ok: true,
    state: { ...next, turnUserId: nextUser },
    closed: false,
  };
}

export function passBid(
  state: BidRoundState,
  userId: string
): BidActionResult {
  if (state.turnUserId !== userId) {
    return { ok: false, error: "Not your turn to pass" };
  }
  if (!state.activeBidders.includes(userId)) {
    return { ok: false, error: "You have already passed this round" };
  }

  const activeBidders = state.activeBidders.filter((id) => id !== userId);
  const passedBidders = [...state.passedBidders, userId];
  const next: BidRoundState = {
    ...state,
    activeBidders,
    passedBidders,
  };

  // Opening pass by turn holder (no bid yet): open bidding to next person
  if (!state.openingComplete && userId === state.turnHolderId) {
    if (activeBidders.length === 0) {
      return { ok: false, error: "No bidders left to open the round" };
    }
    const nextUser = nextActive(state.biddingOrder, activeBidders, userId);
    return {
      ok: true,
      state: {
        ...next,
        turnUserId: nextUser ?? activeBidders[0],
        openingComplete: false,
      },
      closed: false,
    };
  }

  // Auction ends when ≤1 active bidder remains AND an opening bid exists
  if (activeBidders.length <= 1 && state.openingComplete && state.highestBidderId) {
    // Ensure winner is still active (they should be)
    const winnerId =
      activeBidders[0] ?? state.highestBidderId;
    const winningBid = state.lastBids[winnerId] ?? state.highestBid!;
    return {
      ok: true,
      state: { ...next, turnUserId: null },
      closed: true,
      winnerId,
      winningBid,
    };
  }

  // Everyone passed without anyone bidding — round cannot resolve normally
  if (activeBidders.length === 0) {
    return { ok: false, error: "All players passed with no bids" };
  }

  const nextUser = nextActive(state.biddingOrder, activeBidders, userId);
  if (!nextUser) {
    // One active left but no opening bid yet — they must open
    return {
      ok: true,
      state: { ...next, turnUserId: activeBidders[0] },
      closed: false,
    };
  }

  return {
    ok: true,
    state: { ...next, turnUserId: nextUser },
    closed: false,
  };
}
