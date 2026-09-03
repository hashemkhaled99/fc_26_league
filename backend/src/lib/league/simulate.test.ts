import { describe, expect, it } from "vitest";
import {
  defaultTactics,
  monteCarloMatch,
  simulateMatch,
  type SimPlayer,
} from "./simulate";

function makeSquad(prefix: string, ovr: number): SimPlayer[] {
  const positions = [
    "GK",
    "RB",
    "CB",
    "CB",
    "LB",
    "CDM",
    "CM",
    "CAM",
    "RW",
    "ST",
    "LW",
    "CB",
    "CM",
    "ST",
  ];
  return positions.map((position, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix} ${position}${i}`,
    position,
    rating: ovr - (i > 10 ? 3 : 0) + (i % 3),
    isHero: i % 4 === 0,
  }));
}

describe("simulateMatch", () => {
  it("produces a valid scoreline and timeline", () => {
    const home = makeSquad("H", 86);
    const away = makeSquad("A", 84);
    const result = simulateMatch({
      home: { teamName: "Home", players: home, tactics: defaultTactics(home) },
      away: { teamName: "Away", players: away, tactics: defaultTactics(away) },
      seed: 42,
    });

    expect(result.homeScore).toBeGreaterThanOrEqual(0);
    expect(result.awayScore).toBeGreaterThanOrEqual(0);
    expect(result.events[0]?.type).toBe("kickoff");
    expect(result.events[result.events.length - 1]?.type).toBe("ft");
    expect(result.events.some((e) => e.type === "ht")).toBe(true);
  });

  it("applies half-time mentality and subs into the timeline", () => {
    const home = makeSquad("H", 88);
    const away = makeSquad("A", 82);
    const tactics = defaultTactics(home);
    const benchId = home.find((p) => !tactics.starterIds.includes(p.id))!.id;
    const outId = tactics.starterIds.find((id) =>
      home.find((p) => p.id === id && p.position !== "GK")
    )!;

    const result = simulateMatch({
      home: {
        teamName: "Home",
        players: home,
        tactics: {
          ...tactics,
          mentality: "defence",
          halfTimeMentality: "attack",
          halfTimeFormationId: "343",
          substitutions: [{ outId, inId: benchId, minute: 46 }],
        },
      },
      away: { teamName: "Away", players: away, tactics: defaultTactics(away) },
      seed: 7,
    });

    expect(result.events.some((e) => e.type === "sub" && e.minute === 46)).toBe(true);
    const ht = result.events.find((e) => e.type === "ht");
    expect(ht && "note" in ht && ht.note).toBeTruthy();
  });

  it("does not let the stronger side always win (upset variance)", () => {
    const strong = makeSquad("S", 90);
    const weak = makeSquad("W", 78);
    const input = {
      home: { teamName: "Strong", players: strong, tactics: defaultTactics(strong) },
      away: { teamName: "Weak", players: weak, tactics: defaultTactics(weak) },
    };

    const mc = monteCarloMatch(input, 800, 100);
    // Strong home favorites, but not ~100%
    expect(mc.homeWinPct).toBeGreaterThan(45);
    expect(mc.homeWinPct).toBeLessThan(95);
    expect(mc.awayWins + mc.draws).toBeGreaterThan(0);
  });

  it("attack mentality increases average goals vs defence", () => {
    const a = makeSquad("A", 85);
    const b = makeSquad("B", 85);

    const open = monteCarloMatch(
      {
        home: {
          teamName: "A",
          players: a,
          tactics: { ...defaultTactics(a), mentality: "attack" },
        },
        away: {
          teamName: "B",
          players: b,
          tactics: { ...defaultTactics(b), mentality: "attack" },
        },
      },
      600,
      3
    );

    const closed = monteCarloMatch(
      {
        home: {
          teamName: "A",
          players: a,
          tactics: { ...defaultTactics(a), mentality: "defence" },
        },
        away: {
          teamName: "B",
          players: b,
          tactics: { ...defaultTactics(b), mentality: "defence" },
        },
      },
      600,
      3
    );

    expect(open.avgHomeGoals + open.avgAwayGoals).toBeGreaterThan(
      closed.avgHomeGoals + closed.avgAwayGoals
    );
  });

  it("assigns match ratings and a player of the match", () => {
    const home = makeSquad("H", 86);
    const away = makeSquad("A", 84);
    const result = simulateMatch({
      home: { teamName: "Home", players: home, tactics: defaultTactics(home) },
      away: { teamName: "Away", players: away, tactics: defaultTactics(away) },
      seed: 99,
    });

    expect(result.ratings.length).toBeGreaterThan(10);
    expect(result.potm.rating).toBeGreaterThanOrEqual(result.ratings[1]?.rating ?? 0);
    expect(result.potm.name).toBeTruthy();
    expect(result.ratings.every((r) => r.rating >= 4.5 && r.rating <= 10)).toBe(true);
  });
});
