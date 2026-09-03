import { defaultTactics, simulateMatch, type SimPlayer, type TeamTactics } from "./simulate";

export type SeasonTeam = {
  userId: string;
  teamName: string;
  displayName: string;
  players: SimPlayer[];
  tactics: TeamTactics;
};

export type ConfirmedResult = {
  homeUserId: string;
  awayUserId: string;
  homeScore: number;
  awayScore: number;
};

export type RemainingFixture = {
  homeUserId: string;
  awayUserId: string;
};

export type TeamProjection = {
  userId: string;
  teamName: string;
  displayName: string;
  currentPoints: number;
  currentGd: number;
  avgPoints: number;
  avgGd: number;
  titlePct: number;
  top3Pct: number;
  bottomPct: number;
  /** Chance of finishing in each position (1-indexed keys as strings). */
  positionPct: Record<string, number>;
  mostLikelyPosition: number;
};

export type SeasonProjection = {
  runs: number;
  remainingFixtures: number;
  teams: TeamProjection[];
};

function clampRuns(n: number) {
  return Math.max(50, Math.min(3000, Math.floor(n)));
}

function standingKey(userId: string) {
  return userId;
}

function applyResult(
  table: Map<string, { pts: number; gd: number; gf: number; ga: number }>,
  homeId: string,
  awayId: string,
  hs: number,
  as: number
) {
  const home = table.get(homeId)!;
  const away = table.get(awayId)!;
  home.gf += hs;
  home.ga += as;
  away.gf += as;
  away.ga += hs;
  home.gd = home.gf - home.ga;
  away.gd = away.gf - away.ga;
  if (hs > as) {
    home.pts += 3;
  } else if (hs < as) {
    away.pts += 3;
  } else {
    home.pts += 1;
    away.pts += 1;
  }
}

function rankIds(
  table: Map<string, { pts: number; gd: number; gf: number; ga: number }>,
  teamIds: string[]
): string[] {
  return [...teamIds].sort((a, b) => {
    const A = table.get(a)!;
    const B = table.get(b)!;
    if (B.pts !== A.pts) return B.pts - A.pts;
    if (B.gd !== A.gd) return B.gd - A.gd;
    return B.gf - A.gf;
  });
}

/**
 * Monte Carlo remaining fixtures on top of confirmed results.
 * Uses each club's current squad + tactics (defaults if none locked).
 */
export function projectSeason(args: {
  teams: SeasonTeam[];
  confirmed: ConfirmedResult[];
  remaining: RemainingFixture[];
  runs?: number;
  baseSeed?: number;
}): SeasonProjection {
  const runs = clampRuns(args.runs ?? 500);
  const teamIds = args.teams.map((t) => t.userId);
  const byId = new Map(args.teams.map((t) => [t.userId, t]));

  // Current table from confirmed only
  const base = new Map<string, { pts: number; gd: number; gf: number; ga: number }>();
  for (const id of teamIds) {
    base.set(standingKey(id), { pts: 0, gd: 0, gf: 0, ga: 0 });
  }
  for (const m of args.confirmed) {
    if (!base.has(m.homeUserId) || !base.has(m.awayUserId)) continue;
    applyResult(base, m.homeUserId, m.awayUserId, m.homeScore, m.awayScore);
  }

  const sumPts = new Map<string, number>();
  const sumGd = new Map<string, number>();
  const posCounts = new Map<string, number[]>();
  for (const id of teamIds) {
    sumPts.set(id, 0);
    sumGd.set(id, 0);
    posCounts.set(id, Array(teamIds.length).fill(0));
  }

  for (let i = 0; i < runs; i++) {
    const table = new Map<string, { pts: number; gd: number; gf: number; ga: number }>();
    for (const id of teamIds) {
      const b = base.get(id)!;
      table.set(id, { ...b });
    }

    for (let f = 0; f < args.remaining.length; f++) {
      const fix = args.remaining[f];
      const home = byId.get(fix.homeUserId);
      const away = byId.get(fix.awayUserId);
      if (!home || !away) continue;

      const result = simulateMatch({
        home: {
          teamName: home.teamName,
          players: home.players,
          tactics: home.tactics.starterIds.length
            ? home.tactics
            : defaultTactics(home.players),
        },
        away: {
          teamName: away.teamName,
          players: away.players,
          tactics: away.tactics.starterIds.length
            ? away.tactics
            : defaultTactics(away.players),
        },
        seed: (args.baseSeed ?? 42) + i * 10007 + f * 13,
      });
      applyResult(table, fix.homeUserId, fix.awayUserId, result.homeScore, result.awayScore);
    }

    const ranked = rankIds(table, teamIds);
    ranked.forEach((id, idx) => {
      posCounts.get(id)![idx] += 1;
      sumPts.set(id, sumPts.get(id)! + table.get(id)!.pts);
      sumGd.set(id, sumGd.get(id)! + table.get(id)!.gd);
    });
  }

  const teams: TeamProjection[] = args.teams.map((t) => {
    const counts = posCounts.get(t.userId)!;
    const positionPct: Record<string, number> = {};
    let mostLikelyPosition = 1;
    let best = -1;
    counts.forEach((c, idx) => {
      const pct = Math.round((c / runs) * 1000) / 10;
      positionPct[String(idx + 1)] = pct;
      if (c > best) {
        best = c;
        mostLikelyPosition = idx + 1;
      }
    });
    const titlePct = positionPct["1"] ?? 0;
    const top3Pct = [1, 2, 3].reduce((s, p) => s + (positionPct[String(p)] ?? 0), 0);
    const lastPos = teamIds.length;
    const bottomPct = positionPct[String(lastPos)] ?? 0;
    const cur = base.get(t.userId)!;

    return {
      userId: t.userId,
      teamName: t.teamName,
      displayName: t.displayName,
      currentPoints: cur.pts,
      currentGd: cur.gd,
      avgPoints: Math.round((sumPts.get(t.userId)! / runs) * 10) / 10,
      avgGd: Math.round((sumGd.get(t.userId)! / runs) * 10) / 10,
      titlePct: Math.round(titlePct * 10) / 10,
      top3Pct: Math.round(top3Pct * 10) / 10,
      bottomPct: Math.round(bottomPct * 10) / 10,
      positionPct,
      mostLikelyPosition,
    };
  });

  teams.sort((a, b) => b.titlePct - a.titlePct || b.avgPoints - a.avgPoints);

  return {
    runs,
    remainingFixtures: args.remaining.length,
    teams,
  };
}
