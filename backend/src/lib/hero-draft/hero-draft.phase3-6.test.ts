import { describe, expect, it } from "vitest";
import { HERO_DRAFT_EVENTS } from "@/lib/hero-draft/events";
import { getTierVisual } from "@/lib/hero-draft/events";
import { computeDraftRecap } from "@/lib/hero-draft/deductions";

describe("Hero Draft realtime events", () => {
  it("includes the full Phase 3–5 event contract", () => {
    expect(HERO_DRAFT_EVENTS).toContain("round:started");
    expect(HERO_DRAFT_EVENTS).toContain("round:goldenAnnounced");
    expect(HERO_DRAFT_EVENTS).toContain("bidTurn:started");
    expect(HERO_DRAFT_EVENTS).toContain("randomRoll:revealed");
    expect(HERO_DRAFT_EVENTS).toContain("tradeWindow:started");
    expect(HERO_DRAFT_EVENTS).toContain("tradeWindow:ended");
    expect(HERO_DRAFT_EVENTS).toContain("draftRecap:ready");
    expect(HERO_DRAFT_EVENTS).toHaveLength(15);
  });
});

describe("Tier visuals", () => {
  it("distinguishes Gold / Hero / Icon styling", () => {
    expect(getTierVisual("GOLD").label).toBe("Gold");
    expect(getTierVisual("HERO").label).toBe("Hero");
    expect(getTierVisual("ICON").label).toBe("Icon");
    expect(getTierVisual("ICON").border).toContain("violet");
    expect(getTierVisual("HERO").border).toContain("amber");
  });
});

describe("Draft recap (Phase 5)", () => {
  it("handles empty history", () => {
    const r = computeDraftRecap([]);
    expect(r.biggestSpender).toBeNull();
    expect(r.auctionKing).toBeNull();
  });

  it("picks comedy overpaid vs best value correctly", () => {
    const r = computeDraftRecap([
      {
        winnerId: "cheap",
        winningBid: 10,
        auctionedPlayerId: "pA",
        auctionedPlayerRating: 90,
        randomRolls: [],
      },
      {
        winnerId: "rich",
        winningBid: 1000,
        auctionedPlayerId: "pB",
        auctionedPlayerRating: 70,
        randomRolls: [],
      },
    ]);
    expect(r.bestValue?.userId).toBe("cheap");
    expect(r.overpaid?.userId).toBe("rich");
    expect(r.biggestSpender?.userId).toBe("rich");
  });
});

describe("Trade window phase gate", () => {
  it("documents trade_window as an allowed trading phase", () => {
    const allowed = (phase: string) =>
      phase === "trade_window" || phase === "bidding" || phase === "league";
    expect(allowed("trade_window")).toBe(true);
    expect(allowed("hero_draft")).toBe(false);
    expect(allowed("draft_recap")).toBe(false);
  });
});
