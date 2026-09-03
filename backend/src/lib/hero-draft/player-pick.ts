import type { PlayerTier, TierWeights } from "./tiers";
import { pickWeightedTier } from "./tiers";
import type { DraftSlotDef } from "./slots";

export type PickablePlayer = {
  id: string;
  position: string;
  tier: PlayerTier;
  baseRating: number;
  marketValue: number;
  status: string;
};

/** Admin draft min OVR; Golden Round uses the higher of the two floors. */
export function effectiveDraftMinRating(
  minPlayerRating: number,
  goldenRoundMinRating: number,
  isGolden: boolean
): number {
  if (isGolden) return Math.max(minPlayerRating, goldenRoundMinRating);
  return minPlayerRating;
}

/**
 * Pick a random available player matching slot positions + tier weights.
 * Falls back: try preferred tier → other tiers at same positions → any remaining at positions.
 */
export function pickPlayerForSlot(opts: {
  pool: PickablePlayer[];
  slot: DraftSlotDef;
  weights: TierWeights;
  /** Force a minimum rating (admin pool floor / Golden Round) */
  minRating?: number;
  /** Force Gold only (downgrade replacement) */
  forceTier?: PlayerTier;
  excludeIds?: Set<string>;
  rng?: () => number;
}): PickablePlayer | null {
  const rng = opts.rng ?? Math.random;
  const exclude = opts.excludeIds ?? new Set();

  let candidates = opts.pool.filter(
    (p) =>
      p.status === "available" &&
      !exclude.has(p.id) &&
      opts.slot.allowedPositions.includes(p.position)
  );

  if (opts.minRating != null) {
    const above = candidates.filter((p) => p.baseRating >= opts.minRating!);
    if (above.length > 0) candidates = above;
  }

  if (candidates.length === 0) return null;

  if (opts.forceTier) {
    const forced = candidates.filter((p) => p.tier === opts.forceTier);
    const pool = forced.length > 0 ? forced : candidates.filter((p) => p.tier === "GOLD");
    const finalPool = pool.length > 0 ? pool : candidates;
    return finalPool[Math.floor(rng() * finalPool.length)] ?? null;
  }

  const preferred = pickWeightedTier(opts.weights, rng);
  const tierMatch = candidates.filter((p) => p.tier === preferred);
  const pool = tierMatch.length > 0 ? tierMatch : candidates;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}
