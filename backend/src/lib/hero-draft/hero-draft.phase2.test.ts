import { describe, expect, it } from "vitest";
import {
  initBidRound,
  placeBid,
  passBid,
} from "@/lib/hero-draft/bidding-machine";
import { pickPlayerForSlot } from "@/lib/hero-draft/player-pick";
import type { PickablePlayer } from "@/lib/hero-draft/player-pick";
import { DEFAULT_SLOT_TEMPLATE } from "@/lib/hero-draft/slots";
import { DEFAULT_TIER_WEIGHTS } from "@/lib/hero-draft/tiers";

describe("Sequential bidding machine", () => {
  const order = ["a", "b", "c", "d"];

  it("starts with turn holder opening", () => {
    const s = initBidRound({ biddingOrder: order, turnHolderId: "b" });
    expect(s.turnUserId).toBe("b");
    expect(s.activeBidders).toEqual(order);
    expect(s.openingComplete).toBe(false);
  });

  it("advances after opening bid to next in fixed order", () => {
    let s = initBidRound({ biddingOrder: order, turnHolderId: "b" });
    const r = placeBid(s, "b", 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.closed).toBe(false);
    if (r.closed) return;
    expect(r.state.turnUserId).toBe("c");
    expect(r.state.highestBid).toBe(10);
    expect(r.state.openingComplete).toBe(true);
  });

  it("rejects bid from wrong user", () => {
    const s = initBidRound({ biddingOrder: order, turnHolderId: "a" });
    const r = placeBid(s, "b", 10);
    expect(r.ok).toBe(false);
  });

  it("rejects non-raising bid", () => {
    let s = initBidRound({ biddingOrder: order, turnHolderId: "a" });
    const open = placeBid(s, "a", 20);
    expect(open.ok && !open.closed).toBe(true);
    if (!open.ok || open.closed) return;
    const r = placeBid(open.state, "b", 20);
    expect(r.ok).toBe(false);
  });

  it("permanent pass removes from active and closes when one remains", () => {
    let s = initBidRound({ biddingOrder: order, turnHolderId: "a" });
    // a opens
    let r = placeBid(s, "a", 10);
    expect(r.ok && !r.closed).toBe(true);
    if (!r.ok || r.closed) return;
    s = r.state;
    // b passes
    r = passBid(s, "b");
    expect(r.ok && !r.closed).toBe(true);
    if (!r.ok || r.closed) return;
    s = r.state;
    expect(s.activeBidders).toEqual(["a", "c", "d"]);
    // c passes
    r = passBid(s, "c");
    if (!r.ok || r.closed) return;
    s = r.state;
    // d passes → a wins
    r = passBid(s, "d");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.closed).toBe(true);
    if (!r.closed) return;
    expect(r.winnerId).toBe("a");
    expect(r.winningBid).toBe(10);
  });

  it("turn holder can raise again after cycle", () => {
    let s = initBidRound({ biddingOrder: ["a", "b"], turnHolderId: "a" });
    let r = placeBid(s, "a", 10);
    if (!r.ok || r.closed) throw new Error("expected open");
    s = r.state;
    expect(s.turnUserId).toBe("b");
    r = placeBid(s, "b", 15);
    if (!r.ok || r.closed) throw new Error("expected continue");
    s = r.state;
    expect(s.turnUserId).toBe("a");
    r = placeBid(s, "a", 20);
    if (!r.ok || r.closed) throw new Error("expected continue");
    expect(r.state.highestBid).toBe(20);
    expect(r.state.highestBidderId).toBe("a");
  });

  it("AFK turn holder pass opens to next bidder", () => {
    let s = initBidRound({ biddingOrder: order, turnHolderId: "a" });
    const r = passBid(s, "a");
    expect(r.ok && !r.closed).toBe(true);
    if (!r.ok || r.closed) return;
    expect(r.state.activeBidders).not.toContain("a");
    expect(r.state.turnUserId).toBe("b");
    expect(r.state.openingComplete).toBe(false);
  });

  it("everyone except one passes after open → sole bidder wins", () => {
    let s = initBidRound({ biddingOrder: ["a", "b", "c"], turnHolderId: "a" });
    let r = placeBid(s, "a", 50);
    if (!r.ok || r.closed) throw new Error("fail");
    s = r.state;
    r = passBid(s, "b");
    if (!r.ok || r.closed) throw new Error("fail");
    s = r.state;
    r = passBid(s, "c");
    expect(r.ok && r.closed).toBe(true);
    if (!r.ok || !r.closed) return;
    expect(r.winnerId).toBe("a");
    expect(r.winningBid).toBe(50);
  });
});

describe("Player pick for slot", () => {
  const pool: PickablePlayer[] = [
    { id: "g1", position: "CB", tier: "GOLD", baseRating: 78, marketValue: 1, status: "available" },
    { id: "g2", position: "CB", tier: "GOLD", baseRating: 82, marketValue: 1, status: "available" },
    { id: "h1", position: "CB", tier: "HERO", baseRating: 88, marketValue: 1, status: "available" },
    { id: "i1", position: "CB", tier: "ICON", baseRating: 92, marketValue: 1, status: "available" },
    { id: "st1", position: "ST", tier: "GOLD", baseRating: 80, marketValue: 1, status: "available" },
    { id: "owned", position: "CB", tier: "GOLD", baseRating: 80, marketValue: 1, status: "owned" },
  ];

  const cbSlot = DEFAULT_SLOT_TEMPLATE[2]; // CB

  it("only picks matching position and available", () => {
    const p = pickPlayerForSlot({
      pool,
      slot: cbSlot,
      weights: { GOLD: 100, HERO: 0, ICON: 0 },
      rng: () => 0,
    });
    expect(p).not.toBeNull();
    expect(p!.position).toBe("CB");
    expect(p!.status).toBe("available");
    expect(p!.tier).toBe("GOLD");
  });

  it("respects preferred tier when available", () => {
    const p = pickPlayerForSlot({
      pool,
      slot: cbSlot,
      weights: { GOLD: 0, HERO: 0, ICON: 100 },
      rng: () => 0,
    });
    expect(p?.tier).toBe("ICON");
    expect(p?.id).toBe("i1");
  });

  it("forceTier Gold for downgrades", () => {
    const p = pickPlayerForSlot({
      pool,
      slot: cbSlot,
      weights: DEFAULT_TIER_WEIGHTS,
      forceTier: "GOLD",
      rng: () => 0.99,
    });
    expect(p?.tier).toBe("GOLD");
  });

  it("golden min rating filters when possible", () => {
    const p = pickPlayerForSlot({
      pool,
      slot: cbSlot,
      weights: { GOLD: 100, HERO: 0, ICON: 0 },
      minRating: 80,
      rng: () => 0,
    });
    expect(p?.baseRating).toBeGreaterThanOrEqual(80);
    expect(p?.id).toBe("g2");
  });

  it("excludes used ids", () => {
    const p = pickPlayerForSlot({
      pool,
      slot: cbSlot,
      weights: { GOLD: 100, HERO: 0, ICON: 0 },
      excludeIds: new Set(["g1", "g2"]),
      rng: () => 0,
    });
    // falls back to other tiers at CB
    expect(p?.id).not.toBe("g1");
    expect(p?.id).not.toBe("g2");
    expect(["h1", "i1"]).toContain(p?.id);
  });

  it("matches flexible bench FB slot", () => {
    const fb = DEFAULT_SLOT_TEMPLATE[12];
    const flexPool: PickablePlayer[] = [
      { id: "rb1", position: "RB", tier: "GOLD", baseRating: 75, marketValue: 1, status: "available" },
      { id: "cb1", position: "CB", tier: "GOLD", baseRating: 75, marketValue: 1, status: "available" },
    ];
    const p = pickPlayerForSlot({
      pool: flexPool,
      slot: fb,
      weights: DEFAULT_TIER_WEIGHTS,
      rng: () => 0,
    });
    expect(p?.id).toBe("rb1");
  });
});
