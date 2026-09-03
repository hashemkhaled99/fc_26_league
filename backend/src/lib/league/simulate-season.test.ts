import { describe, expect, it } from "vitest";
import { defaultTactics, type SimPlayer } from "./simulate";
import { projectSeason } from "./simulate-season";

function makeSquad(prefix: string, ovr: number): SimPlayer[] {
  const positions = [
    "GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "ST", "LW", "CB", "CM", "ST",
  ];
  return positions.map((position, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix} ${position}${i}`,
    position,
    rating: ovr - (i > 10 ? 3 : 0) + (i % 3),
  }));
}

describe("projectSeason", () => {
  it("projects title odds from remaining fixtures", () => {
    const a = makeSquad("A", 90);
    const b = makeSquad("B", 80);
    const c = makeSquad("C", 78);

    const projection = projectSeason({
      teams: [
        {
          userId: "a",
          teamName: "Alpha",
          displayName: "A",
          players: a,
          tactics: defaultTactics(a),
        },
        {
          userId: "b",
          teamName: "Beta",
          displayName: "B",
          players: b,
          tactics: defaultTactics(b),
        },
        {
          userId: "c",
          teamName: "Gamma",
          displayName: "C",
          players: c,
          tactics: defaultTactics(c),
        },
      ],
      confirmed: [{ homeUserId: "a", awayUserId: "b", homeScore: 2, awayScore: 0 }],
      remaining: [
        { homeUserId: "a", awayUserId: "c" },
        { homeUserId: "b", awayUserId: "c" },
      ],
      runs: 200,
      baseSeed: 11,
    });

    expect(projection.remainingFixtures).toBe(2);
    expect(projection.teams).toHaveLength(3);
    const alpha = projection.teams.find((t) => t.userId === "a")!;
    expect(alpha.titlePct).toBeGreaterThan(40);
    expect(alpha.mostLikelyPosition).toBe(1);
  });
});
