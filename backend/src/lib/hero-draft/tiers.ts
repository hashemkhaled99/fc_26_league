export type PlayerTier = "GOLD" | "HERO" | "ICON";

export type TierWeights = {
  GOLD: number;
  HERO: number;
  ICON: number;
};

export const DEFAULT_TIER_WEIGHTS: TierWeights = {
  GOLD: 70,
  HERO: 25,
  ICON: 5,
};

/** Sync legacy boolean flags from tier (source of truth). */
export function flagsFromTier(tier: PlayerTier): { isIcon: boolean; isHero: boolean } {
  return {
    isIcon: tier === "ICON",
    isHero: tier === "HERO",
  };
}

/** Derive tier from legacy flags (for backfill / migration). */
export function tierFromFlags(isIcon: boolean, isHero: boolean): PlayerTier {
  if (isIcon) return "ICON";
  if (isHero) return "HERO";
  return "GOLD";
}

export function validateTierWeights(weights: TierWeights): string | null {
  const sum = weights.GOLD + weights.HERO + weights.ICON;
  if (sum !== 100) return `Tier weights must sum to 100 (got ${sum})`;
  if (weights.GOLD < 0 || weights.HERO < 0 || weights.ICON < 0) {
    return "Tier weights cannot be negative";
  }
  return null;
}

/**
 * Weighted random tier pick.
 * `rng` returns [0, 1) — inject for tests.
 */
export function pickWeightedTier(
  weights: TierWeights = DEFAULT_TIER_WEIGHTS,
  rng: () => number = Math.random
): PlayerTier {
  const error = validateTierWeights(weights);
  if (error) throw new Error(error);

  const roll = rng() * 100;
  if (roll < weights.GOLD) return "GOLD";
  if (roll < weights.GOLD + weights.HERO) return "HERO";
  return "ICON";
}
