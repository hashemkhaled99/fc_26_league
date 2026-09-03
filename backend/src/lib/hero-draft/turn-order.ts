/**
 * Pure turn-queue helpers for Hero Draft (section 3.1).
 * Turn holder rotates fairly; bidding order is a separate fixed list.
 */

/** Fisher–Yates shuffle (non-mutating). */
export function shuffleIds(ids: string[], rng: () => number = Math.random): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getTurnHolder(turnQueue: string[], pointer: number): string {
  if (turnQueue.length === 0) throw new Error("Empty turn queue");
  return turnQueue[pointer % turnQueue.length];
}

/** Advance pointer after a round completes. */
export function advanceTurnPointer(pointer: number, queueLength: number): number {
  if (queueLength === 0) throw new Error("Empty turn queue");
  return (pointer + 1) % queueLength;
}

/**
 * Master bidding order is fixed at draft start.
 * Each round, bidding starts with the person *after* the turn holder in this order.
 */
export function getBidderAfterTurnHolder(
  biddingOrder: string[],
  turnHolderId: string
): string {
  if (biddingOrder.length === 0) throw new Error("Empty bidding order");
  const idx = biddingOrder.indexOf(turnHolderId);
  if (idx < 0) throw new Error("Turn holder not in bidding order");
  return biddingOrder[(idx + 1) % biddingOrder.length];
}

/**
 * Next active bidder after `currentUserId` in fixed order, skipping passed users.
 * Returns null if only one (or zero) active bidder remains.
 */
export function nextActiveBidder(
  biddingOrder: string[],
  activeBidders: string[],
  currentUserId: string
): string | null {
  const active = new Set(activeBidders);
  if (active.size <= 1) return null;

  const start = biddingOrder.indexOf(currentUserId);
  if (start < 0) throw new Error("Current user not in bidding order");

  for (let step = 1; step <= biddingOrder.length; step++) {
    const candidate = biddingOrder[(start + step) % biddingOrder.length];
    if (active.has(candidate)) return candidate;
  }
  return null;
}

/** Pick golden round index secretly at draft start (0 .. totalRounds-1). */
export function pickGoldenRoundIndex(
  totalRounds: number = 18,
  rng: () => number = Math.random
): number {
  if (totalRounds < 1) throw new Error("Need at least one round");
  return Math.floor(rng() * totalRounds);
}
