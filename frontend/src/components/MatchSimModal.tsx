"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicSocketUrl } from "@/lib/public-env";

type Mentality = "attack" | "balanced" | "defence";

type SimPlayer = {
  id: string;
  name: string;
  position: string;
  rating: number;
  isHero?: boolean;
  isIcon?: boolean;
};

type TeamTactics = {
  formationId: string;
  mentality: Mentality;
  starterIds: string[];
  substitutions: Array<{ outId: string; inId: string; minute: number }>;
  halfTimeMentality?: Mentality;
  halfTimeFormationId?: string;
};

type MatchEvent =
  | { type: "kickoff"; minute: 0 }
  | {
      type: "goal";
      minute: number;
      side: "home" | "away";
      scorerName: string;
      score: [number, number];
    }
  | { type: "sub"; minute: number; side: "home" | "away"; outName: string; inName: string }
  | { type: "ht"; minute: 45; homeScore: number; awayScore: number; note?: string }
  | { type: "ft"; minute: 90; homeScore: number; awayScore: number };

type PlayerRating = {
  playerId: string;
  name: string;
  position: string;
  side: "home" | "away";
  rating: number;
  goals: number;
  minutes: number;
};

type SimResult = {
  homeScore: number;
  awayScore: number;
  homeXg: number;
  awayXg: number;
  events: MatchEvent[];
  homeStrength: { attack: number; defence: number };
  awayStrength: { attack: number; defence: number };
  ratings: PlayerRating[];
  potm: PlayerRating;
};

type Odds = {
  runs: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  mostCommonScore: string;
};

type SetupPayload = {
  match: {
    id: string;
    homeUser: { id: string; teamName: string };
    awayUser: { id: string; teamName: string };
  };
  locks: { homeLocked: boolean; awayLocked: boolean; bothLocked: boolean };
  home: { players: SimPlayer[]; defaultTactics: TeamTactics };
  away: { players: SimPlayer[]; defaultTactics: TeamTactics };
  formations: Array<{ id: string; name: string }>;
  youAre: "home" | "away" | "spectator";
};

const MENTALITIES: Array<{ id: Mentality; label: string }> = [
  { id: "attack", label: "Attack" },
  { id: "balanced", label: "Balanced" },
  { id: "defence", label: "Defence" },
];

function TeamPanel({
  title,
  lockedLabel,
  players,
  tactics,
  formations,
  onChange,
  editable,
}: {
  title: string;
  lockedLabel: string;
  players: SimPlayer[];
  tactics: TeamTactics;
  formations: Array<{ id: string; name: string }>;
  onChange: (t: TeamTactics) => void;
  editable: boolean;
}) {
  const starterSet = useMemo(() => new Set(tactics.starterIds), [tactics.starterIds]);
  const starters = players.filter((p) => starterSet.has(p.id));
  const bench = players.filter((p) => !starterSet.has(p.id));

  function toggleStarter(id: string) {
    if (!editable) return;
    const has = starterSet.has(id);
    let next = [...tactics.starterIds];
    if (has) {
      next = next.filter((x) => x !== id);
    } else if (next.length < 11) {
      next = [...next, id];
    } else {
      const lowest = [...starters].sort((a, b) => a.rating - b.rating)[0];
      if (lowest) next = next.map((x) => (x === lowest.id ? id : x));
    }
    onChange({ ...tactics, starterIds: next.slice(0, 11) });
  }

  function addSub() {
    if (!editable || tactics.substitutions.length >= 5) return;
    const outId = starters.find((p) => p.position !== "GK")?.id ?? starters[0]?.id ?? "";
    const inId = bench[0]?.id ?? "";
    if (!outId || !inId) return;
    onChange({
      ...tactics,
      substitutions: [...tactics.substitutions, { outId, inId, minute: 60 }],
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-fc-charcoal/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-bold text-fc-gold">{title}</h4>
        <span className="text-[10px] uppercase tracking-wide text-fc-muted">{lockedLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-fc-muted">
          Formation
          <select
            className="fc-input mt-1 text-sm"
            disabled={!editable}
            value={tactics.formationId}
            onChange={(e) => onChange({ ...tactics, formationId: e.target.value })}
          >
            {formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-fc-muted">
          Mentality
          <select
            className="fc-input mt-1 text-sm"
            disabled={!editable}
            value={tactics.mentality}
            onChange={(e) =>
              onChange({ ...tactics, mentality: e.target.value as Mentality })
            }
          >
            {MENTALITIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-fc-muted">
          HT Mentality
          <select
            className="fc-input mt-1 text-sm"
            disabled={!editable}
            value={tactics.halfTimeMentality ?? ""}
            onChange={(e) =>
              onChange({
                ...tactics,
                halfTimeMentality: e.target.value
                  ? (e.target.value as Mentality)
                  : undefined,
              })
            }
          >
            <option value="">Keep same</option>
            {MENTALITIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-fc-muted">
          HT Formation
          <select
            className="fc-input mt-1 text-sm"
            disabled={!editable}
            value={tactics.halfTimeFormationId ?? ""}
            onChange={(e) =>
              onChange({
                ...tactics,
                halfTimeFormationId: e.target.value || undefined,
              })
            }
          >
            <option value="">Keep same</option>
            {formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="text-xs text-fc-muted mb-1">
          Starting XI ({tactics.starterIds.length}/11)
        </p>
        <div className="max-h-36 overflow-y-auto space-y-1">
          {players
            .slice()
            .sort((a, b) => b.rating - a.rating)
            .map((p) => {
              const on = starterSet.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => toggleStarter(p.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                    on ? "bg-fc-gold/15 text-white" : "bg-white/5 text-fc-muted"
                  }`}
                >
                  <span>
                    <span className="font-mono text-fc-muted mr-2">{p.position}</span>
                    {p.name}
                    {p.isIcon ? " ★" : p.isHero ? " ◆" : ""}
                  </span>
                  <span className="font-mono text-fc-gold">{p.rating}</span>
                </button>
              );
            })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-fc-muted">Subs (max 5)</p>
          {editable && (
            <button type="button" className="text-xs text-fc-accent hover:underline" onClick={addSub}>
              + Add sub
            </button>
          )}
        </div>
        {tactics.substitutions.length === 0 ? (
          <p className="text-xs text-fc-muted/70">None planned</p>
        ) : (
          <div className="space-y-2">
            {tactics.substitutions.map((sub, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_4rem_auto] gap-1 items-center">
                <select
                  className="fc-input text-xs py-1"
                  disabled={!editable}
                  value={sub.outId}
                  onChange={(e) => {
                    const next = [...tactics.substitutions];
                    next[i] = { ...sub, outId: e.target.value };
                    onChange({ ...tactics, substitutions: next });
                  }}
                >
                  {starters.map((p) => (
                    <option key={p.id} value={p.id}>
                      Out: {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="fc-input text-xs py-1"
                  disabled={!editable}
                  value={sub.inId}
                  onChange={(e) => {
                    const next = [...tactics.substitutions];
                    next[i] = { ...sub, inId: e.target.value };
                    onChange({ ...tactics, substitutions: next });
                  }}
                >
                  {bench.map((p) => (
                    <option key={p.id} value={p.id}>
                      In: {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="fc-input text-xs py-1 text-center"
                  disabled={!editable}
                  value={sub.minute}
                  onChange={(e) => {
                    const next = [...tactics.substitutions];
                    next[i] = { ...sub, minute: Number(e.target.value) || 1 };
                    onChange({ ...tactics, substitutions: next });
                  }}
                />
                {editable && (
                  <button
                    type="button"
                    className="text-xs text-red-300"
                    onClick={() =>
                      onChange({
                        ...tactics,
                        substitutions: tactics.substitutions.filter((_, j) => j !== i),
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-fc-muted mt-1">Tip: minute 46 = half-time sub</p>
      </div>
    </div>
  );
}

export function MatchSimModal({
  code,
  matchId,
  onClose,
  onApplied,
}: {
  code: string;
  matchId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [homeTactics, setHomeTactics] = useState<TeamTactics | null>(null);
  const [awayTactics, setAwayTactics] = useState<TeamTactics | null>(null);
  const [locks, setLocks] = useState({ homeLocked: false, awayLocked: false, bothLocked: false });
  const [result, setResult] = useState<SimResult | null>(null);
  const [odds, setOdds] = useState<Odds | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/league/simulate`), {
      ...apiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup", matchId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load setup");
    const data = json as SetupPayload;
    setSetup(data);
    setLocks(data.locks);
    setHomeTactics({
      ...data.home.defaultTactics,
      substitutions: data.home.defaultTactics.substitutions ?? [],
    });
    setAwayTactics({
      ...data.away.defaultTactics,
      substitutions: data.away.defaultTactics.substitutions ?? [],
    });
  }, [code, matchId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    let socket: { disconnect: () => void } | null = null;
    import("socket.io-client").then(({ io }) => {
      const s = io(socketUrl, { transports: ["websocket", "polling"] });
      socket = s;
      s.on("connect", () => s.emit("room:join", { roomCode: code }));
      s.on("match:sim_lock", (p: { matchId: string }) => {
        if (p.matchId === matchId) load().catch(() => undefined);
      });
    });
    return () => socket?.disconnect();
  }, [code, matchId, load]);

  const myTactics = setup?.youAre === "home" ? homeTactics : setup?.youAre === "away" ? awayTactics : null;
  const myLocked =
    setup?.youAre === "home" ? locks.homeLocked : setup?.youAre === "away" ? locks.awayLocked : true;

  async function lockOrUnlock() {
    if (!setup || setup.youAre === "spectator" || !myTactics) return;
    setBusy(true);
    setError("");
    try {
      const action = myLocked ? "unlock" : "lock";
      const res = await fetch(apiPath(`/api/rooms/${code}/league/simulate`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "lock"
            ? { action: "lock", matchId, tactics: myTactics }
            : { action: "unlock", matchId }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setLocks({
        homeLocked: json.homeLocked,
        awayLocked: json.awayLocked,
        bothLocked: json.bothLocked,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: "preview" | "odds" | "apply") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/league/simulate`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          matchId,
          runs: action === "odds" ? 1000 : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      if (action === "preview" || action === "apply") {
        setResult(json.result as SimResult);
        setOdds(null);
      }
      if (action === "odds") setOdds(json.odds as Odds);
      if (action === "apply") onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const canEditHome = setup?.youAre === "home" && !locks.homeLocked;
  const canEditAway = setup?.youAre === "away" && !locks.awayLocked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm overflow-y-auto">
      <div className="fc-card w-full max-w-4xl my-4 p-5 max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-fc-gold">Match Simulation</h3>
            {setup && (
              <p className="text-sm text-fc-muted mt-1">
                {setup.match.homeUser.teamName} vs {setup.match.awayUser.teamName}
              </p>
            )}
            <p className="text-xs text-fc-muted mt-1">
              Each manager locks their own tactics. Sim runs only when both are locked.
            </p>
          </div>
          <button type="button" className="fc-btn-secondary text-xs py-1.5 px-3" onClick={onClose}>
            Close
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!setup || !homeTactics || !awayTactics ? (
          <p className="mt-8 text-center text-fc-muted">Loading squads…</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span
                className={`rounded px-2 py-1 ${
                  locks.homeLocked ? "bg-fc-green/20 text-fc-green" : "bg-white/5 text-fc-muted"
                }`}
              >
                Home {locks.homeLocked ? "locked" : "unlocked"}
              </span>
              <span
                className={`rounded px-2 py-1 ${
                  locks.awayLocked ? "bg-fc-green/20 text-fc-green" : "bg-white/5 text-fc-muted"
                }`}
              >
                Away {locks.awayLocked ? "locked" : "unlocked"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <TeamPanel
                title={`Home · ${setup.match.homeUser.teamName}`}
                lockedLabel={locks.homeLocked ? "Locked" : "Editing"}
                players={setup.home.players}
                tactics={homeTactics}
                formations={setup.formations}
                onChange={setHomeTactics}
                editable={canEditHome}
              />
              <TeamPanel
                title={`Away · ${setup.match.awayUser.teamName}`}
                lockedLabel={locks.awayLocked ? "Locked" : "Editing"}
                players={setup.away.players}
                tactics={awayTactics}
                formations={setup.formations}
                onChange={setAwayTactics}
                editable={canEditAway}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {setup.youAre !== "spectator" && (
                <button
                  type="button"
                  disabled={busy}
                  className="fc-btn-secondary text-sm"
                  onClick={lockOrUnlock}
                >
                  {busy ? "…" : myLocked ? "Unlock my tactics" : "Lock my tactics"}
                </button>
              )}
              <button
                type="button"
                disabled={busy || !locks.bothLocked}
                className="fc-btn-secondary text-sm"
                onClick={() => run("preview")}
              >
                Play once
              </button>
              <button
                type="button"
                disabled={busy || !locks.bothLocked}
                className="fc-btn-secondary text-sm"
                onClick={() => run("odds")}
              >
                Odds (1000 sims)
              </button>
              <button
                type="button"
                disabled={busy || !locks.bothLocked || setup.youAre === "spectator"}
                className="fc-btn-primary text-sm"
                onClick={() => run("apply")}
              >
                Sim &amp; Report
              </button>
            </div>

            {!locks.bothLocked && (
              <p className="mt-2 text-xs text-fc-muted">
                Waiting for both managers to lock tactics before the sim can run.
              </p>
            )}

            {odds && (
              <div className="mt-4 rounded-lg border border-white/10 bg-fc-navy/40 p-4">
                <h4 className="font-display text-sm font-bold text-fc-gold mb-2">
                  Projected odds · {odds.runs} runs
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-2xl font-bold text-white">{odds.homeWinPct}%</p>
                    <p className="text-xs text-fc-muted">Home</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{odds.drawPct}%</p>
                    <p className="text-xs text-fc-muted">Draw</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{odds.awayWinPct}%</p>
                    <p className="text-xs text-fc-muted">Away</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-fc-muted text-center">
                  Avg {odds.avgHomeGoals}–{odds.avgAwayGoals} · most common {odds.mostCommonScore}
                </p>
              </div>
            )}

            {result && (
              <div className="mt-4 rounded-lg border border-fc-gold/20 bg-fc-navy/50 p-4 space-y-4">
                <div className="text-center">
                  <p className="font-display text-3xl font-bold text-fc-gold">
                    {result.homeScore} – {result.awayScore}
                  </p>
                  <p className="text-xs text-fc-muted mt-1">
                    xG {result.homeXg} – {result.awayXg}
                  </p>
                </div>

                {result.potm && (
                  <div className="rounded-lg bg-fc-gold/10 border border-fc-gold/30 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-fc-gold">Player of the Match</p>
                    <p className="font-display text-lg font-bold text-white mt-0.5">
                      {result.potm.name}{" "}
                      <span className="text-fc-gold font-mono">{result.potm.rating.toFixed(1)}</span>
                    </p>
                    <p className="text-xs text-fc-muted">
                      {result.potm.position} · {result.potm.side} · {result.potm.goals}G ·{" "}
                      {result.potm.minutes}&apos;
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wide text-fc-muted mb-2">Match ratings</p>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {(["home", "away"] as const).map((side) => (
                      <ul key={side} className="space-y-0.5 text-xs">
                        {result.ratings
                          .filter((r) => r.side === side)
                          .slice(0, 14)
                          .map((r) => (
                            <li key={r.playerId} className="flex justify-between gap-2">
                              <span className="truncate text-fc-muted">
                                <span className="font-mono mr-1">{r.position}</span>
                                {r.name}
                                {r.goals > 0 ? ` (${r.goals})` : ""}
                              </span>
                              <span
                                className={`font-mono shrink-0 ${
                                  r.playerId === result.potm.playerId
                                    ? "text-fc-gold font-bold"
                                    : "text-white"
                                }`}
                              >
                                {r.rating.toFixed(1)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    ))}
                  </div>
                </div>

                <ul className="max-h-40 overflow-y-auto space-y-1 text-sm border-t border-white/5 pt-3">
                  {result.events.map((e, i) => {
                    if (e.type === "kickoff")
                      return (
                        <li key={i} className="text-fc-muted text-xs">
                          0&apos; Kick off
                        </li>
                      );
                    if (e.type === "goal")
                      return (
                        <li key={i}>
                          <span className="text-fc-gold font-mono">{e.minute}&apos;</span> Goal —{" "}
                          {e.scorerName} ({e.side}){" "}
                          <span className="text-fc-muted">
                            {e.score[0]}–{e.score[1]}
                          </span>
                        </li>
                      );
                    if (e.type === "sub")
                      return (
                        <li key={i} className="text-fc-muted">
                          <span className="font-mono">{e.minute}&apos;</span> Sub ({e.side}):{" "}
                          {e.outName} → {e.inName}
                        </li>
                      );
                    if (e.type === "ht")
                      return (
                        <li key={i} className="text-fc-accent text-xs uppercase tracking-wide">
                          HT {e.homeScore}–{e.awayScore}
                          {e.note ? ` · ${e.note}` : ""}
                        </li>
                      );
                    if (e.type === "ft")
                      return (
                        <li key={i} className="text-fc-gold text-xs uppercase tracking-wide">
                          FT {e.homeScore}–{e.awayScore}
                        </li>
                      );
                    return null;
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
