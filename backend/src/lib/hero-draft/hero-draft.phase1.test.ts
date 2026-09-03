import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER_WEIGHTS,
  flagsFromTier,
  tierFromFlags,
  validateTierWeights,
  pickWeightedTier,
} from "@/lib/hero-draft/tiers";
import {
  DEFAULT_SLOT_TEMPLATE,
  TOTAL_DRAFT_SLOTS,
  getSlotByIndex,
  pickRandomUnfilledSlotIndex,
  playerMatchesSlot,
} from "@/lib/hero-draft/slots";
import {
  shuffleIds,
  getTurnHolder,
  advanceTurnPointer,
  getBidderAfterTurnHolder,
  nextActiveBidder,
  pickGoldenRoundIndex,
} from "@/lib/hero-draft/turn-order";
import {
  computeRandomRollDeduction,
  computeDraftRecap,
} from "@/lib/hero-draft/deductions";

describe("PlayerTier helpers", () => {
  it("maps flags from tier", () => {
    expect(flagsFromTier("GOLD")).toEqual({ isIcon: false, isHero: false });
    expect(flagsFromTier("HERO")).toEqual({ isIcon: false, isHero: true });
    expect(flagsFromTier("ICON")).toEqual({ isIcon: true, isHero: false });
  });

  it("maps tier from legacy flags", () => {
    expect(tierFromFlags(false, false)).toBe("GOLD");
    expect(tierFromFlags(false, true)).toBe("HERO");
    expect(tierFromFlags(true, false)).toBe("ICON");
    expect(tierFromFlags(true, true)).toBe("ICON");
  });

  it("validates weights sum to 100", () => {
    expect(validateTierWeights(DEFAULT_TIER_WEIGHTS)).toBeNull();
    expect(validateTierWeights({ GOLD: 50, HERO: 50, ICON: 5 })).toMatch(/sum to 100/);
  });

  it("picks weighted tier deterministically", () => {
    expect(pickWeightedTier(DEFAULT_TIER_WEIGHTS, () => 0)).toBe("GOLD");
    expect(pickWeightedTier(DEFAULT_TIER_WEIGHTS, () => 0.69)).toBe("GOLD");
    expect(pickWeightedTier(DEFAULT_TIER_WEIGHTS, () => 0.7)).toBe("HERO");
    expect(pickWeightedTier(DEFAULT_TIER_WEIGHTS, () => 0.949)).toBe("HERO");
    expect(pickWeightedTier(DEFAULT_TIER_WEIGHTS, () => 0.95)).toBe("ICON");
  });
});

describe("Slot template", () => {
  it("has 18 slots with correct bench buckets", () => {
    expect(TOTAL_DRAFT_SLOTS).toBe(18);
    expect(DEFAULT_SLOT_TEMPLATE).toHaveLength(18);
    expect(DEFAULT_SLOT_TEMPLATE.filter((s) => s.isStarting)).toHaveLength(11);
    expect(DEFAULT_SLOT_TEMPLATE.filter((s) => !s.isStarting)).toHaveLength(7);

    const bench = DEFAULT_SLOT_TEMPLATE.filter((s) => !s.isStarting);
    expect(bench[0].allowedPositions).toEqual(["CB"]);
    expect(bench[1].allowedPositions).toEqual(["RB", "LB"]);
    expect(bench[2].allowedPositions).toEqual(["CM", "CDM", "CAM"]);
    expect(bench[3].allowedPositions).toEqual(["CM", "CDM", "CAM"]);
    expect(bench[4].allowedPositions).toEqual(["CAM", "ST"]);
    expect(bench[5].allowedPositions).toEqual(["LM", "LW"]);
    expect(bench[6].allowedPositions).toEqual(["RM", "RW"]);
  });

  it("matches players to slots strictly", () => {
    const cb = getSlotByIndex(2);
    expect(playerMatchesSlot("CB", cb)).toBe(true);
    expect(playerMatchesSlot("CDM", cb)).toBe(false);

    const benchFb = getSlotByIndex(12);
    expect(playerMatchesSlot("RB", benchFb)).toBe(true);
    expect(playerMatchesSlot("LB", benchFb)).toBe(true);
    expect(playerMatchesSlot("CB", benchFb)).toBe(false);
  });

  it("picks only unfilled slots", () => {
    const filled = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    expect(pickRandomUnfilledSlotIndex(filled, 18, () => 0)).toBe(17);
  });
});

describe("Turn order", () => {
  it("rotates turn holder fairly", () => {
    const queue = ["a", "b", "c"];
    expect(getTurnHolder(queue, 0)).toBe("a");
    expect(getTurnHolder(queue, 1)).toBe("b");
    expect(advanceTurnPointer(2, 3)).toBe(0);
    expect(getTurnHolder(queue, advanceTurnPointer(2, 3))).toBe("a");
  });

  it("starts bidding after turn holder in fixed order", () => {
    const order = ["a", "b", "c", "d"];
    expect(getBidderAfterTurnHolder(order, "b")).toBe("c");
    expect(getBidderAfterTurnHolder(order, "d")).toBe("a");
  });

  it("skips passed bidders when advancing", () => {
    const order = ["a", "b", "c", "d"];
    expect(nextActiveBidder(order, ["a", "c"], "a")).toBe("c");
    expect(nextActiveBidder(order, ["a"], "a")).toBeNull();
  });

  it("shuffles without mutating input", () => {
    const ids = ["1", "2", "3"];
    const copy = [...ids];
    let i = 0;
    const rng = () => {
      const vals = [0.9, 0.1, 0.5];
      return vals[i++] ?? 0;
    };
    const out = shuffleIds(ids, rng);
    expect(ids).toEqual(copy);
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(ids));
  });

  it("picks golden round in range", () => {
    expect(pickGoldenRoundIndex(18, () => 0)).toBe(0);
    expect(pickGoldenRoundIndex(18, () => 0.999)).toBe(17);
  });
});

describe("Deductions & recap", () => {
  it("charges own last bid for active losers", () => {
    const d = computeRandomRollDeduction({
      lastBidAmount: 40_000_000,
      winningBid: 50_000_000,
    });
    expect(d.deductionType).toBe("OWN_LAST_BID");
    expect(d.amount).toBe(40_000_000);
  });

  it("charges half final price for pure passers", () => {
    const d = computeRandomRollDeduction({
      lastBidAmount: null,
      winningBid: 50_000_000,
      passiveDeductionRatio: 0.5,
    });
    expect(d.deductionType).toBe("HALF_FINAL_PRICE");
    expect(d.amount).toBe(25_000_000);
  });

  it("computes draft recap awards", () => {
    const recap = computeDraftRecap([
      {
        winnerId: "u1",
        winningBid: 100,
        auctionedPlayerId: "p1",
        auctionedPlayerRating: 90,
        randomRolls: [
          { userId: "u2", playerId: "p2", rating: 85 },
          { userId: "u3", playerId: "p3", rating: 70 },
        ],
      },
      {
        winnerId: "u1",
        winningBid: 50,
        auctionedPlayerId: "p4",
        auctionedPlayerRating: 80,
        randomRolls: [
          { userId: "u2", playerId: "p5", rating: 88 },
          { userId: "u3", playerId: "p6", rating: 72 },
        ],
      },
      {
        winnerId: "u2",
        winningBid: 200,
        auctionedPlayerId: "p7",
        auctionedPlayerRating: 75,
        randomRolls: [{ userId: "u1", playerId: "p8", rating: 82 }],
      },
    ]);

    expect(recap.biggestSpender).toEqual({ userId: "u2", amount: 200 });
    expect(recap.auctionKing?.userId).toBe("u1");
    expect(recap.auctionKing?.wins).toBe(2);
    expect(recap.luckiest?.userId).toBe("u2");
    expect(recap.unluckiest?.userId).toBe("u3");
    // best value: u1 round2 → 80/50 = 1.6; u1 round1 → 0.9; u2 → 0.375
    expect(recap.bestValue?.userId).toBe("u1");
    expect(recap.bestValue?.playerId).toBe("p4");
    expect(recap.overpaid?.userId).toBe("u2");
  });
});

describe("Room mode create payload", () => {
  it("accepts FREE_MARKET and HERO_DRAFT modes in schema shape", async () => {
    const { z } = await import("zod");
    const createSchema = z.object({
      roomName: z.string().min(2).max(50),
      displayName: z.string().min(2).max(30),
      teamName: z.string().min(2).max(40),
      pin: z.string().min(4).max(8).optional(),
      mode: z.enum(["FREE_MARKET", "HERO_DRAFT"]).default("FREE_MARKET"),
    });
    expect(createSchema.parse({
      roomName: "Test League",
      displayName: "Admin",
      teamName: "FC Test",
    }).mode).toBe("FREE_MARKET");
    expect(createSchema.parse({
      roomName: "Hero League",
      displayName: "Admin",
      teamName: "FC Hero",
      mode: "HERO_DRAFT",
    }).mode).toBe("HERO_DRAFT");
  });
});
