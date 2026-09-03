import {
  getSimFormation,
  positionFit,
  slotRole,
  type SimFormationId,
} from "./simulate-formations";

export type Mentality = "attack" | "balanced" | "defence";

export type SimPlayer = {
  id: string;
  name: string;
  position: string;
  rating: number;
  isHero?: boolean;
  isIcon?: boolean;
};

export type Substitution = {
  outId: string;
  inId: string;
  /** Minute when the sub happens (1–90). Half-time subs use 46. */
  minute: number;
};

export type TeamTactics = {
  formationId: SimFormationId | string;
  mentality: Mentality;
  /** Exactly 11 starter player ids (order does not matter; assigned by fit). */
  starterIds: string[];
  /** Planned substitutions (max 5). Applied at given minutes. */
  substitutions?: Substitution[];
  /** Half-time mentality override (applied from minute 46). */
  halfTimeMentality?: Mentality;
  /** Half-time formation override. */
  halfTimeFormationId?: SimFormationId | string;
};

export type SimMatchInput = {
  home: { teamName: string; players: SimPlayer[]; tactics: TeamTactics };
  away: { teamName: string; players: SimPlayer[]; tactics: TeamTactics };
  /** Optional seed for reproducible sims. */
  seed?: number;
};

export type MatchEvent =
  | { type: "kickoff"; minute: 0 }
  | { type: "goal"; minute: number; side: "home" | "away"; scorerId: string; scorerName: string; score: [number, number] }
  | { type: "sub"; minute: number; side: "home" | "away"; outName: string; inName: string }
  | { type: "ht"; minute: 45; homeScore: number; awayScore: number; note?: string }
  | { type: "ft"; minute: 90; homeScore: number; awayScore: number };

export type PlayerMatchRating = {
  playerId: string;
  name: string;
  position: string;
  side: "home" | "away";
  rating: number;
  goals: number;
  minutes: number;
};

export type SimMatchResult = {
  homeScore: number;
  awayScore: number;
  homeXg: number;
  awayXg: number;
  events: MatchEvent[];
  homeStrength: { attack: number; defence: number };
  awayStrength: { attack: number; defence: number };
  ratings: PlayerMatchRating[];
  potm: PlayerMatchRating;
};

export type MonteCarloSummary = {
  runs: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  mostCommonScore: string;
};

const MENTALITY_MOD: Record<
  Mentality,
  { atk: number; def: number; openness: number }
> = {
  attack: { atk: 0.1, def: -0.08, openness: 1.18 },
  balanced: { atk: 0, def: 0, openness: 1 },
  defence: { atk: -0.1, def: 0.12, openness: 0.82 },
};

const HOME_ADVANTAGE = 1.08;
const BASE_GOALS_PER_TEAM = 1.35;
/** Form noise — keeps favorites from always winning. */
const FORM_SIGMA = 0.14;
const MAX_SUBS = 5;

/** Seeded PRNG (mulberry32). */
export function createRng(seed?: number): () => number {
  let s = (seed ?? Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 70;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function poissonSample(lambda: number, rng: () => number): number {
  const L = Math.exp(-Math.max(0, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 20);
  return k - 1;
}

function rarityBoost(p: SimPlayer): number {
  if (p.isIcon) return 1.5;
  if (p.isHero) return 0.75;
  return 0;
}

function effectiveRating(p: SimPlayer, fit: number, fresh: number): number {
  const fitMul = 0.65 + (fit / 100) * 0.35;
  return (p.rating + rarityBoost(p)) * fitMul * fresh;
}

type OnPitch = {
  player: SimPlayer;
  slot: string;
  role: ReturnType<typeof slotRole>;
  fit: number;
  fresh: number;
};

function assignLineup(
  players: SimPlayer[],
  starterIds: string[],
  formationId: string
): OnPitch[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const formation = getSimFormation(formationId);
  const available = starterIds
    .map((id) => byId.get(id))
    .filter((p): p is SimPlayer => !!p)
    .slice(0, 11);

  // Pad with highest remaining if short
  if (available.length < 11) {
    const used = new Set(available.map((p) => p.id));
    const extras = [...players]
      .filter((p) => !used.has(p.id))
      .sort((a, b) => b.rating - a.rating);
    for (const e of extras) {
      if (available.length >= 11) break;
      available.push(e);
    }
  }

  const slots = [...formation.slots];
  const remaining = [...available];
  const lineup: OnPitch[] = [];

  for (const slot of slots) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const fit = positionFit(p.position, slot);
      const score = fit * 2 + p.rating;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const player = remaining.splice(bestIdx, 1)[0];
    if (!player) break;
    const fit = positionFit(player.position, slot);
    lineup.push({
      player,
      slot,
      role: slotRole(slot),
      fit,
      fresh: 1,
    });
  }

  return lineup;
}

function computeStrength(
  lineup: OnPitch[],
  formationId: string,
  mentality: Mentality
): { attack: number; defence: number } {
  const formation = getSimFormation(formationId);
  const ment = MENTALITY_MOD[mentality];

  const gk = lineup.filter((x) => x.role === "gk").map((x) => effectiveRating(x.player, x.fit, x.fresh));
  const def = lineup.filter((x) => x.role === "def").map((x) => effectiveRating(x.player, x.fit, x.fresh));
  const mid = lineup.filter((x) => x.role === "mid").map((x) => effectiveRating(x.player, x.fit, x.fresh));
  const att = lineup.filter((x) => x.role === "att").map((x) => effectiveRating(x.player, x.fit, x.fresh));

  const attack =
    avg(att) * 0.55 +
    avg(mid) * 0.35 +
    avg(def) * 0.1;
  const defence =
    avg(gk) * 0.28 +
    avg(def) * 0.42 +
    avg(mid) * 0.25 +
    avg(att) * 0.05;

  return {
    attack: attack * (1 + formation.atkBias + ment.atk),
    defence: defence * (1 + formation.defBias + ment.def),
  };
}

function applySubs(
  lineup: OnPitch[],
  bench: SimPlayer[],
  subs: Substitution[],
  minute: number,
  formationId: string,
  events: MatchEvent[],
  side: "home" | "away",
  usedSubs: number,
  minuteTracker: Map<string, { side: "home" | "away"; player: SimPlayer; onSince: number; minutes: number; goals: number; role: ReturnType<typeof slotRole> }>
): { lineup: OnPitch[]; bench: SimPlayer[]; usedSubs: number } {
  const due = subs.filter((s) => s.minute === minute);
  if (due.length === 0) return { lineup, bench, usedSubs };

  let nextLineup = [...lineup];
  let nextBench = [...bench];
  let used = usedSubs;
  const formation = getSimFormation(formationId);

  for (const sub of due) {
    if (used >= MAX_SUBS) break;
    const outIdx = nextLineup.findIndex((x) => x.player.id === sub.outId);
    const inIdx = nextBench.findIndex((p) => p.id === sub.inId);
    if (outIdx < 0 || inIdx < 0) continue;

    const out = nextLineup[outIdx];
    const incoming = nextBench[inIdx];
    const slot = out.slot;
    const fit = positionFit(incoming.position, slot);

    // Close minutes for outgoing
    const outTrack = minuteTracker.get(out.player.id);
    if (outTrack && outTrack.onSince >= 0) {
      outTrack.minutes += Math.max(0, minute - outTrack.onSince);
      outTrack.onSince = -1;
    }

    nextLineup[outIdx] = {
      player: incoming,
      slot,
      role: slotRole(slot),
      fit,
      fresh: 1.06, // fresh legs bump
    };
    nextBench.splice(inIdx, 1);
    nextBench.push(out.player);
    used++;

    // Open minutes for incoming
    const existing = minuteTracker.get(incoming.id);
    if (existing) {
      existing.onSince = minute;
      existing.role = slotRole(slot);
    } else {
      minuteTracker.set(incoming.id, {
        side,
        player: incoming,
        onSince: minute,
        minutes: 0,
        goals: 0,
        role: slotRole(slot),
      });
    }

    events.push({
      type: "sub",
      minute,
      side,
      outName: out.player.name,
      inName: incoming.name,
    });

    void formation;
  }

  return { lineup: nextLineup, bench: nextBench, usedSubs: used };
}

function buildMatchRatings(
  tracker: Map<string, { side: "home" | "away"; player: SimPlayer; onSince: number; minutes: number; goals: number; role: ReturnType<typeof slotRole> }>,
  homeScore: number,
  awayScore: number,
  rng: () => number
): { ratings: PlayerMatchRating[]; potm: PlayerMatchRating } {
  // Close anyone still on pitch
  for (const t of tracker.values()) {
    if (t.onSince >= 0) {
      t.minutes += Math.max(0, 90 - t.onSince);
      t.onSince = -1;
    }
  }

  const ratings: PlayerMatchRating[] = [];
  for (const t of tracker.values()) {
    if (t.minutes <= 0) continue;
    const won =
      (t.side === "home" && homeScore > awayScore) ||
      (t.side === "away" && awayScore > homeScore);
    const drew = homeScore === awayScore;
    const cleanSheet =
      (t.side === "home" && awayScore === 0) || (t.side === "away" && homeScore === 0);
    const concededHeavy =
      (t.side === "home" && awayScore >= 3) || (t.side === "away" && homeScore >= 3);

    let r = 6.0;
    r += t.goals * 0.85;
    if (t.role === "gk" || t.role === "def") {
      if (cleanSheet) r += 0.6;
      if (concededHeavy) r -= 0.4;
    }
    if (t.role === "mid" && t.goals === 0) r += 0.1;
    if (won) r += 0.35;
    else if (drew) r += 0.1;
    else r -= 0.15;

    // Minutes factor — brief cameos slightly capped
    const minFactor = clamp(t.minutes / 70, 0.75, 1);
    r *= minFactor;
    r += (rng() - 0.5) * 0.5; // small variance
    r = Math.round(clamp(r, 4.5, 10) * 10) / 10;

    ratings.push({
      playerId: t.player.id,
      name: t.player.name,
      position: t.player.position,
      side: t.side,
      rating: r,
      goals: t.goals,
      minutes: t.minutes,
    });
  }

  ratings.sort((a, b) => b.rating - a.rating || b.goals - a.goals);
  const potm = ratings[0] ?? {
    playerId: "none",
    name: "N/A",
    position: "CM",
    side: "home" as const,
    rating: 6,
    goals: 0,
    minutes: 90,
  };

  return { ratings, potm };
}

function pickScorer(lineup: OnPitch[], rng: () => number): SimPlayer {
  const weights = lineup.map((x) => {
    if (x.role === "att") return Math.max(1, effectiveRating(x.player, x.fit, x.fresh) * 1.4);
    if (x.role === "mid") return Math.max(1, effectiveRating(x.player, x.fit, x.fresh) * 0.7);
    if (x.role === "def") return Math.max(1, effectiveRating(x.player, x.fit, x.fresh) * 0.15);
    return 1; // rare GK own-goal-ish / long kick — tiny weight
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < lineup.length; i++) {
    r -= weights[i];
    if (r <= 0) return lineup[i].player;
  }
  return lineup[0]?.player ?? { id: "?", name: "Unknown", position: "ST", rating: 70 };
}

function applyFatigue(lineup: OnPitch[], minute: number) {
  // Gradual fatigue after 60'
  if (minute < 60) return;
  const factor = minute >= 75 ? 0.97 : 0.985;
  for (const x of lineup) {
    x.fresh *= factor;
  }
}

function mentalityAt(
  tactics: TeamTactics,
  minute: number
): Mentality {
  if (minute >= 46 && tactics.halfTimeMentality) return tactics.halfTimeMentality;
  return tactics.mentality;
}

function formationAt(tactics: TeamTactics, minute: number): string {
  if (minute >= 46 && tactics.halfTimeFormationId) return tactics.halfTimeFormationId;
  return tactics.formationId;
}

function normalizeSubs(tactics: TeamTactics): Substitution[] {
  const list = [...(tactics.substitutions ?? [])]
    .filter((s) => s.outId && s.inId && s.minute >= 1 && s.minute <= 90)
    .sort((a, b) => a.minute - b.minute)
    .slice(0, MAX_SUBS);

  // Deduplicate minutes loosely — allow multiple at same minute
  return list;
}

/**
 * Simulate one full match with formations, mentality, HT changes, and subs.
 * Highest OVR does NOT always win — form noise + Poisson scoring create upsets.
 */
export function simulateMatch(input: SimMatchInput): SimMatchResult {
  const rng = createRng(input.seed);
  const events: MatchEvent[] = [{ type: "kickoff", minute: 0 }];

  const homePlayers = input.home.players;
  const awayPlayers = input.away.players;
  const homeTactics = input.home.tactics;
  const awayTactics = input.away.tactics;

  let homeLineup = assignLineup(homePlayers, homeTactics.starterIds, homeTactics.formationId);
  let awayLineup = assignLineup(awayPlayers, awayTactics.starterIds, awayTactics.formationId);

  const homeStarterSet = new Set(homeLineup.map((x) => x.player.id));
  const awayStarterSet = new Set(awayLineup.map((x) => x.player.id));
  let homeBench = homePlayers.filter((p) => !homeStarterSet.has(p.id));
  let awayBench = awayPlayers.filter((p) => !awayStarterSet.has(p.id));

  const homeSubs = normalizeSubs(homeTactics);
  const awaySubs = normalizeSubs(awayTactics);
  let homeUsedSubs = 0;
  let awayUsedSubs = 0;

  const minuteTracker = new Map<
    string,
    {
      side: "home" | "away";
      player: SimPlayer;
      onSince: number;
      minutes: number;
      goals: number;
      role: ReturnType<typeof slotRole>;
    }
  >();
  for (const x of homeLineup) {
    minuteTracker.set(x.player.id, {
      side: "home",
      player: x.player,
      onSince: 0,
      minutes: 0,
      goals: 0,
      role: x.role,
    });
  }
  for (const x of awayLineup) {
    minuteTracker.set(x.player.id, {
      side: "away",
      player: x.player,
      onSince: 0,
      minutes: 0,
      goals: 0,
      role: x.role,
    });
  }

  let homeScore = 0;
  let awayScore = 0;
  let homeXg = 0;
  let awayXg = 0;

  const homeKickStrength = computeStrength(
    homeLineup,
    homeTactics.formationId,
    homeTactics.mentality
  );
  const awayKickStrength = computeStrength(
    awayLineup,
    awayTactics.formationId,
    awayTactics.mentality
  );

  // Two halves; recompute λ each half from current lineup/tactics
  for (const half of [1, 2] as const) {
    const startMin = half === 1 ? 1 : 46;
    const endMin = half === 1 ? 45 : 90;
    const minuteForTactics = half === 1 ? 1 : 46;

    if (half === 2) {
      // Apply HT formation change by re-slotting same 11
      const hForm = formationAt(homeTactics, 46);
      const aForm = formationAt(awayTactics, 46);
      const hIds = homeLineup.map((x) => x.player.id);
      const aIds = awayLineup.map((x) => x.player.id);
      const hFresh = new Map(homeLineup.map((x) => [x.player.id, x.fresh]));
      const aFresh = new Map(awayLineup.map((x) => [x.player.id, x.fresh]));
      homeLineup = assignLineup(homePlayers, hIds, hForm).map((x) => ({
        ...x,
        fresh: hFresh.get(x.player.id) ?? x.fresh,
      }));
      awayLineup = assignLineup(awayPlayers, aIds, aForm).map((x) => ({
        ...x,
        fresh: aFresh.get(x.player.id) ?? x.fresh,
      }));

      // HT subs often planned at minute 46
      const hs = applySubs(
        homeLineup,
        homeBench,
        homeSubs,
        46,
        hForm,
        events,
        "home",
        homeUsedSubs,
        minuteTracker
      );
      homeLineup = hs.lineup;
      homeBench = hs.bench;
      homeUsedSubs = hs.usedSubs;

      const as = applySubs(
        awayLineup,
        awayBench,
        awaySubs,
        46,
        aForm,
        events,
        "away",
        awayUsedSubs,
        minuteTracker
      );
      awayLineup = as.lineup;
      awayBench = as.bench;
      awayUsedSubs = as.usedSubs;

      const hNote =
        homeTactics.halfTimeMentality || homeTactics.halfTimeFormationId
          ? `HT: ${homeTactics.halfTimeMentality ?? homeTactics.mentality} / ${getSimFormation(hForm).name}`
          : undefined;
      events.push({
        type: "ht",
        minute: 45,
        homeScore,
        awayScore,
        note: hNote,
      });
    }

    const hMent = mentalityAt(homeTactics, minuteForTactics);
    const aMent = mentalityAt(awayTactics, minuteForTactics);
    const hForm = formationAt(homeTactics, minuteForTactics);
    const aForm = formationAt(awayTactics, minuteForTactics);

    const hStr = computeStrength(homeLineup, hForm, hMent);
    const aStr = computeStrength(awayLineup, aForm, aMent);

    // Form noise — underdogs can still win
    const hFormNoise = 1 + (rng() * 2 - 1) * FORM_SIGMA;
    const aFormNoise = 1 + (rng() * 2 - 1) * FORM_SIGMA;

    const openness =
      (MENTALITY_MOD[hMent].openness + MENTALITY_MOD[aMent].openness) / 2;

    // Ratio-based expected goals for this half (~half of full match)
    const ratioHome = clamp((hStr.attack * hFormNoise) / Math.max(55, aStr.defence * aFormNoise), 0.55, 1.85);
    const ratioAway = clamp((aStr.attack * aFormNoise) / Math.max(55, hStr.defence * hFormNoise), 0.55, 1.85);

    const halfShare = 0.5;
    const lambdaHome =
      BASE_GOALS_PER_TEAM *
      halfShare *
      ratioHome *
      HOME_ADVANTAGE *
      openness *
      (0.92 + rng() * 0.16);
    const lambdaAway =
      BASE_GOALS_PER_TEAM *
      halfShare *
      ratioAway *
      openness *
      (0.92 + rng() * 0.16);

    homeXg += lambdaHome;
    awayXg += lambdaAway;

    const goalsH = poissonSample(lambdaHome, rng);
    const goalsA = poissonSample(lambdaAway, rng);

    // Spread goals across minutes in this half
    const placeGoals = (n: number, side: "home" | "away") => {
      for (let i = 0; i < n; i++) {
        const minute = startMin + Math.floor(rng() * (endMin - startMin + 1));
        const lineup = side === "home" ? homeLineup : awayLineup;
        const scorer = pickScorer(lineup, rng);
        if (side === "home") homeScore++;
        else awayScore++;
        const track = minuteTracker.get(scorer.id);
        if (track) track.goals += 1;
        events.push({
          type: "goal",
          minute,
          side,
          scorerId: scorer.id,
          scorerName: scorer.name,
          score: [homeScore, awayScore],
        });
      }
    };
    placeGoals(goalsH, "home");
    placeGoals(goalsA, "away");

    // Mid-half subs + fatigue ticks
    for (let m = startMin; m <= endMin; m++) {
      if (m === 46) continue; // already handled
      if (homeSubs.some((s) => s.minute === m) || awaySubs.some((s) => s.minute === m)) {
        const hs = applySubs(
          homeLineup,
          homeBench,
          homeSubs,
          m,
          hForm,
          events,
          "home",
          homeUsedSubs,
          minuteTracker
        );
        homeLineup = hs.lineup;
        homeBench = hs.bench;
        homeUsedSubs = hs.usedSubs;
        const as = applySubs(
          awayLineup,
          awayBench,
          awaySubs,
          m,
          aForm,
          events,
          "away",
          awayUsedSubs,
          minuteTracker
        );
        awayLineup = as.lineup;
        awayBench = as.bench;
        awayUsedSubs = as.usedSubs;
      }
      if (m === 60 || m === 75) {
        applyFatigue(homeLineup, m);
        applyFatigue(awayLineup, m);
      }
    }
  }

  // Sort timeline events (kickoff first, ft last)
  const kickoff = events.filter((e) => e.type === "kickoff");
  const mid = events
    .filter((e) => e.type !== "kickoff" && e.type !== "ft")
    .sort((a, b) => {
      const am = "minute" in a ? a.minute : 0;
      const bm = "minute" in b ? b.minute : 0;
      if (am !== bm) return am - bm;
      if (a.type === "ht") return -1;
      if (b.type === "ht") return 1;
      return 0;
    });
  events.length = 0;
  events.push(...kickoff, ...mid, { type: "ft", minute: 90, homeScore, awayScore });

  const { ratings, potm } = buildMatchRatings(minuteTracker, homeScore, awayScore, rng);

  return {
    homeScore,
    awayScore,
    homeXg: Math.round(homeXg * 100) / 100,
    awayXg: Math.round(awayXg * 100) / 100,
    events,
    homeStrength: {
      attack: Math.round(homeKickStrength.attack * 10) / 10,
      defence: Math.round(homeKickStrength.defence * 10) / 10,
    },
    awayStrength: {
      attack: Math.round(awayKickStrength.attack * 10) / 10,
      defence: Math.round(awayKickStrength.defence * 10) / 10,
    },
    ratings,
    potm,
  };
}

/** Run many sims — same tactics, fresh RNG each run. */
export function monteCarloMatch(
  input: Omit<SimMatchInput, "seed">,
  runs = 1000,
  baseSeed?: number
): MonteCarloSummary {
  const n = clamp(Math.floor(runs), 50, 5000);
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let sumH = 0;
  let sumA = 0;
  const scores = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const seed = (baseSeed ?? 1) + i * 9973;
    const r = simulateMatch({ ...input, seed });
    sumH += r.homeScore;
    sumA += r.awayScore;
    const key = `${r.homeScore}-${r.awayScore}`;
    scores.set(key, (scores.get(key) ?? 0) + 1);
    if (r.homeScore > r.awayScore) homeWins++;
    else if (r.homeScore < r.awayScore) awayWins++;
    else draws++;
  }

  let mostCommonScore = "0-0";
  let best = 0;
  for (const [k, v] of scores) {
    if (v > best) {
      best = v;
      mostCommonScore = k;
    }
  }

  return {
    runs: n,
    homeWins,
    draws,
    awayWins,
    homeWinPct: Math.round((homeWins / n) * 1000) / 10,
    drawPct: Math.round((draws / n) * 1000) / 10,
    awayWinPct: Math.round((awayWins / n) * 1000) / 10,
    avgHomeGoals: Math.round((sumH / n) * 100) / 100,
    avgAwayGoals: Math.round((sumA / n) * 100) / 100,
    mostCommonScore,
  };
}

/** Build default tactics from a squad (top 11 by rating as starters). */
export function defaultTactics(players: SimPlayer[]): TeamTactics {
  const sorted = [...players].sort((a, b) => b.rating - a.rating);
  const gk = sorted.find((p) => p.position === "GK");
  const rest = sorted.filter((p) => p.id !== gk?.id);
  const starters = gk ? [gk, ...rest.slice(0, 10)] : sorted.slice(0, 11);
  return {
    formationId: "433",
    mentality: "balanced",
    starterIds: starters.map((p) => p.id),
    substitutions: [],
  };
}
