"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useState } from "react";

type TeamProjection = {
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
  mostLikelyPosition: number;
};

type Projection = {
  runs: number;
  remainingFixtures: number;
  teams: TeamProjection[];
};

export function SeasonProjectionPanel({
  code,
  myUserId,
  onClose,
}: {
  code: string;
  myUserId: string;
  onClose: () => void;
}) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(runs = 500) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/league/simulate`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "season_projection", runs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Projection failed");
      setProjection(json.projection as Projection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm overflow-y-auto">
      <div className="fc-card w-full max-w-3xl my-4 p-5 max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-fc-gold">Season Projection</h3>
            <p className="text-xs text-fc-muted mt-1">
              Monte Carlo remaining fixtures from current standings. Favorites are tilted — not
              guaranteed.
            </p>
          </div>
          <button type="button" className="fc-btn-secondary text-xs py-1.5 px-3" onClick={onClose}>
            Close
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="fc-btn-primary text-sm"
            onClick={() => run(500)}
          >
            {busy ? "Simulating…" : "Project (500 runs)"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="fc-btn-secondary text-sm"
            onClick={() => run(1500)}
          >
            Deeper (1500)
          </button>
        </div>

        {projection && (
          <div className="mt-4">
            <p className="text-xs text-fc-muted mb-3">
              {projection.runs} runs · {projection.remainingFixtures} fixtures left
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fc-muted text-xs uppercase border-b border-white/10">
                    <th className="py-2 pr-2">Team</th>
                    <th className="py-2 px-1 text-center">Now</th>
                    <th className="py-2 px-1 text-center">Avg Pts</th>
                    <th className="py-2 px-1 text-center">Likely #</th>
                    <th className="py-2 px-1 text-center">Title %</th>
                    <th className="py-2 pl-2 text-center">Top 3 %</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.teams.map((t) => (
                    <tr
                      key={t.userId}
                      className={`border-b border-white/5 ${
                        t.userId === myUserId ? "bg-fc-gold/5" : ""
                      }`}
                    >
                      <td className="py-2 pr-2 font-semibold">{t.teamName}</td>
                      <td className="py-2 px-1 text-center text-fc-muted">
                        {t.currentPoints}pts
                      </td>
                      <td className="py-2 px-1 text-center">{t.avgPoints}</td>
                      <td className="py-2 px-1 text-center font-mono text-fc-gold">
                        {t.mostLikelyPosition}
                      </td>
                      <td className="py-2 px-1 text-center">{t.titlePct}%</td>
                      <td className="py-2 pl-2 text-center">{t.top3Pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
