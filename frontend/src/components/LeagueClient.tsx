"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { onBudgetUpdated } from "@/lib/room-socket";

interface Standing {
  userId: string;
  teamName: string;
  displayName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  currentStreak: number;
  currentStreakType: string | null;
  onFire: boolean;
}

interface MatchRow {
  id: string;
  homeUser: { id: string; teamName: string; displayName: string };
  awayUser: { id: string; teamName: string; displayName: string };
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  canReport: boolean;
  canConfirm: boolean;
  canDispute: boolean;
}

interface Data {
  room: { code: string; name: string; phase: string; season: number };
  user: { id: string; teamName: string; budget: number; isAdmin: boolean };
  standings: Standing[];
  matches: MatchRow[];
}

export function LeagueClient({ code }: { code: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [report, setReport] = useState<MatchRow | null>(null);
  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/league`), apiFetchInit);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load league");
    return json as Data;
  }, [code]);

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";
    import("socket.io-client").then(({ io }) => {
      const socket = io(socketUrl, { transports: ["websocket", "polling"] });
      socket.on("connect", () => socket.emit("room:join", { roomCode: code }));
      socket.on("match:updated", () => load().then(setData));
      socket.on("phase:changed", () => load().then(setData));
      onBudgetUpdated(socket, () => load().then(setData));
      return () => socket.disconnect();
    });
  }, [code, load]);

  async function run(
    matchId: string,
    action: "report" | "confirm" | "dispute",
    scores?: { homeScore: number; awayScore: number }
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/league`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action, ...scores }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setReport(null);
      setToast(
        action === "report"
          ? "Result submitted — waiting for opponent"
          : action === "confirm"
            ? "Result confirmed"
            : "Match disputed — admin will resolve"
      );
      setTimeout(() => setToast(null), 3500);
      await load().then(setData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fc-gold font-display text-xl">
        Loading league...
      </div>
    );
  }

  if (data.room.phase !== "league" && data.room.phase !== "season_end") {
    return (
      <RoomLayoutShell
        code={data.room.code}
        roomName={data.room.name}
        phase={data.room.phase}
        teamName={data.user.teamName}
        budget={data.user.budget}
        isAdmin={data.user.isAdmin}
      >
        <GlowCard>
          <p className="text-fc-muted text-center py-8">
            League hasn&apos;t started yet. Finish icon boxes, then admin clicks{" "}
            <span className="text-fc-gold">Start League</span>.
          </p>
        </GlowCard>
      </RoomLayoutShell>
    );
  }

  const myMatches = data.matches.filter(
    (m) =>
      m.homeUser.id === data.user.id || m.awayUser.id === data.user.id
  );

  return (
    <RoomLayoutShell
      code={data.room.code}
      roomName={data.room.name}
      phase={data.room.phase}
      teamName={data.user.teamName}
      budget={data.user.budget}
      isAdmin={data.user.isAdmin}
    >
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fc-gold px-6 py-3 text-sm font-semibold text-fc-navy shadow-glow">
          {toast}
        </div>
      )}

      {report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="fc-card w-full max-w-md p-6">
            <h3 className="font-display text-xl font-bold text-fc-gold">Report Result</h3>
            <p className="mt-2 text-sm text-fc-muted">
              {report.homeUser.teamName} vs {report.awayUser.teamName}
            </p>
            <p className="text-xs text-fc-muted mt-1">Enter the real FC26 score. Opponent must confirm.</p>
            <div className="mt-4 flex items-center gap-3">
              <label className="flex-1 text-sm">
                <span className="text-fc-muted text-xs">{report.homeUser.teamName}</span>
                <input
                  type="number"
                  min={0}
                  className="fc-input mt-1 text-center text-xl"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                />
              </label>
              <span className="text-fc-muted pt-5">–</span>
              <label className="flex-1 text-sm">
                <span className="text-fc-muted text-xs">{report.awayUser.teamName}</span>
                <input
                  type="number"
                  min={0}
                  className="fc-input mt-1 text-center text-xl"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" className="fc-btn-secondary flex-1" onClick={() => setReport(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="fc-btn-primary flex-1"
                onClick={() =>
                  run(report.id, "report", {
                    homeScore: Number(homeScore),
                    awayScore: Number(awayScore),
                  })
                }
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}

        <GlowCard glow="gold">
          <h1 className="font-display text-2xl font-bold text-fc-gold">
            League · Season {data.room.season}
          </h1>
          <p className="text-sm text-fc-muted mt-1">
            Play in FC26, then report scores here. Opponent confirms.
          </p>
        </GlowCard>

        <GlowCard>
          <h2 className="font-display text-lg font-semibold mb-3">Standings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fc-muted text-xs uppercase border-b border-white/10">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Team</th>
                  <th className="py-2 px-1 text-center">P</th>
                  <th className="py-2 px-1 text-center">W</th>
                  <th className="py-2 px-1 text-center">D</th>
                  <th className="py-2 px-1 text-center">L</th>
                  <th className="py-2 px-1 text-center">GD</th>
                  <th className="py-2 pl-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((row, i) => (
                  <tr
                    key={row.userId}
                    className={`border-b border-white/5 ${
                      row.userId === data.user.id ? "bg-fc-gold/5" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 text-fc-muted">{i + 1}</td>
                    <td className="py-2 pr-2 font-semibold">
                      {row.teamName}
                      {row.onFire && (
                        <span className="ml-2 text-xs text-orange-400">🔥 On Fire</span>
                      )}
                    </td>
                    <td className="py-2 px-1 text-center">{row.played}</td>
                    <td className="py-2 px-1 text-center">{row.won}</td>
                    <td className="py-2 px-1 text-center">{row.drawn}</td>
                    <td className="py-2 px-1 text-center">{row.lost}</td>
                    <td className="py-2 px-1 text-center">{row.gd}</td>
                    <td className="py-2 pl-2 text-right font-bold text-fc-gold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlowCard>

        <GlowCard>
          <h2 className="font-display text-lg font-semibold mb-3">My Fixtures</h2>
          <div className="space-y-2">
            {myMatches.length === 0 ? (
              <p className="text-fc-muted text-sm">No fixtures yet.</p>
            ) : (
              myMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-fc-charcoal/50 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold">
                      {m.homeUser.teamName}{" "}
                      <span className="text-fc-muted font-mono">
                        {m.homeScore != null ? `${m.homeScore} – ${m.awayScore}` : "vs"}
                      </span>{" "}
                      {m.awayUser.teamName}
                    </p>
                    <p className="text-xs text-fc-muted capitalize">{m.status.replace(/_/g, " ")}</p>
                  </div>
                  <div className="flex gap-2">
                    {m.canReport && (
                      <button
                        type="button"
                        className="fc-btn-primary text-xs py-2 px-3"
                        onClick={() => {
                          setHomeScore("0");
                          setAwayScore("0");
                          setReport(m);
                        }}
                      >
                        Report
                      </button>
                    )}
                    {m.canConfirm && (
                      <button
                        type="button"
                        disabled={busy}
                        className="fc-btn-primary text-xs py-2 px-3"
                        onClick={() => run(m.id, "confirm")}
                      >
                        Confirm
                      </button>
                    )}
                    {m.canDispute && (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-xs font-semibold text-red-300 hover:underline"
                        onClick={() => run(m.id, "dispute")}
                      >
                        Dispute
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </GlowCard>

        <GlowCard>
          <h2 className="font-display text-lg font-semibold mb-3">All Fixtures</h2>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {data.matches.map((m) => (
              <div
                key={m.id}
                className="flex justify-between gap-2 text-sm px-2 py-1.5 rounded hover:bg-white/5"
              >
                <span>
                  {m.homeUser.teamName}{" "}
                  <span className="text-fc-muted font-mono">
                    {m.homeScore != null ? `${m.homeScore}–${m.awayScore}` : "vs"}
                  </span>{" "}
                  {m.awayUser.teamName}
                </span>
                <span className="text-xs text-fc-muted capitalize shrink-0">
                  {m.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>
    </RoomLayoutShell>
  );
}
