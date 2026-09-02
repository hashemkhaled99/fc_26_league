"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { formatMoney } from "@/lib/utils";

interface HistoryData {
  room: { code: string; name: string; phase: string; season: number };
  summary: {
    totalDeals: number;
    totalVolume: number;
    avgPrice: number;
    resaleCount: number;
    tradeCount: number;
    activeLoans: number;
  };
  recentDeals: Array<{
    id: string;
    playerName: string;
    position: string;
    rating: number;
    price: number;
    isResale: boolean;
    winnerTeam: string;
    sellerTeam: string | null;
    at: string;
  }>;
  biggestDeals: Array<{
    id: string;
    playerName: string;
    position: string;
    rating: number;
    price: number;
    winnerTeam: string;
    isResale: boolean;
  }>;
  byPosition: Array<{
    position: string;
    count: number;
    totalVolume: number;
    avgPrice: number;
  }>;
  topSpenders: Array<{
    teamName: string;
    displayName: string;
    totalSpent: number;
    dealsWon: number;
  }>;
  topSellers: Array<{
    teamName: string;
    totalEarned: number;
    sales: number;
  }>;
  tradeHistory: Array<{
    id: string;
    fromTeam: string;
    toTeam: string;
    playersOffered: number;
    playersRequested: number;
    cashAdjustment: number;
    at: string;
  }>;
  loanHistory: Array<{
    id: string;
    playerName: string;
    lenderTeam: string;
    borrowerTeam: string;
    loanFee: number;
    fixturesTotal: number;
    fixturesPlayed: number;
    status: string;
    at: string;
  }>;
}

export default function MarketHistoryPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/market/history`), apiFetchInit);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load");
    return payload as HistoryData;
  }, [code]);

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [load]);

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-display text-xl text-fc-gold">Loading market stats...</p>
      </div>
    );
  }

  const { summary } = data;

  return (
    <RoomLayoutShell code={data.room.code} roomName={data.room.name} phase={data.room.phase}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-fc-muted">Season {data.room.season}</p>
            <h1 className="font-display text-3xl font-bold text-fc-gold">Market History & Stats</h1>
            <p className="mt-1 text-sm text-fc-muted">
              All-time transfer data for this room.
            </p>
          </div>
          <Link href={`/room/${code}/market`} className="fc-btn-secondary text-sm">
            ← Back to Market
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total deals", value: summary.totalDeals.toString() },
            { label: "Total volume", value: formatMoney(summary.totalVolume) },
            { label: "Avg deal", value: formatMoney(summary.avgPrice) },
            { label: "Resales", value: summary.resaleCount.toString() },
          ].map((stat, i) => (
            <GlowCard key={stat.label} delay={i * 0.05}>
              <p className="text-[10px] uppercase tracking-wider text-fc-muted">{stat.label}</p>
              <p className="font-display text-2xl font-bold text-fc-gold">{stat.value}</p>
            </GlowCard>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-lg font-bold text-fc-gold mb-3">Biggest Deals</h2>
            <div className="space-y-2">
              {data.biggestDeals.length === 0 ? (
                <p className="text-sm text-fc-muted">No deals yet.</p>
              ) : (
                data.biggestDeals.map((d, i) => (
                  <div key={d.id} className="fc-card flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        <span className="text-fc-muted text-xs mr-2">#{i + 1}</span>
                        {d.playerName}
                      </p>
                      <p className="text-xs text-fc-muted">
                        {d.position} · {d.rating} · {d.winnerTeam}
                        {d.isResale ? " · resale" : ""}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-fc-green">{formatMoney(d.price)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-fc-gold mb-3">Top Spenders</h2>
            <div className="space-y-2">
              {data.topSpenders.length === 0 ? (
                <p className="text-sm text-fc-muted">No spenders yet.</p>
              ) : (
                data.topSpenders.map((s, i) => (
                  <div key={s.teamName} className="fc-card flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-semibold">
                        <span className="text-fc-muted text-xs mr-2">#{i + 1}</span>
                        {s.teamName}
                      </p>
                      <p className="text-xs text-fc-muted">{s.dealsWon} deals won</p>
                    </div>
                    <span className="font-mono font-bold text-fc-gold">{formatMoney(s.totalSpent)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section>
          <h2 className="font-display text-lg font-bold text-fc-gold mb-3">By Position</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.byPosition.map((p) => (
              <div key={p.position} className="fc-card px-4 py-3">
                <p className="font-bold">{p.position}</p>
                <p className="text-xs text-fc-muted">{p.count} deals</p>
                <p className="font-mono text-sm text-fc-green mt-1">avg {formatMoney(p.avgPrice)}</p>
              </div>
            ))}
          </div>
        </section>

        {data.topSellers.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-bold text-fc-gold mb-3">Top Resale Sellers</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.topSellers.map((s) => (
                <div key={s.teamName} className="fc-card px-4 py-3">
                  <p className="font-semibold">{s.teamName}</p>
                  <p className="text-xs text-fc-muted">{s.sales} sales</p>
                  <p className="font-mono text-fc-green">{formatMoney(s.totalEarned)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display text-lg font-bold text-fc-gold mb-3">Recent Deals</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.recentDeals.map((d) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fc-card px-4 py-3 text-sm"
              >
                <span className="font-semibold text-fc-gold">{d.winnerTeam}</span>
                <span className="text-fc-muted"> signed </span>
                <span className="font-semibold">{d.playerName}</span>
                <span className="text-fc-muted"> ({d.position} {d.rating}) for </span>
                <span className="font-mono text-fc-green">{formatMoney(d.price)}</span>
                {d.sellerTeam && (
                  <span className="text-fc-muted"> from {d.sellerTeam}</span>
                )}
              </motion.div>
            ))}
          </div>
        </section>

        {(data.tradeHistory.length > 0 || data.loanHistory.length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {data.tradeHistory.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-bold text-fc-gold mb-3">Completed Trades</h2>
                <div className="space-y-2">
                  {data.tradeHistory.slice(0, 15).map((t) => (
                    <div key={t.id} className="fc-card px-4 py-3 text-sm">
                      <span className="font-semibold">{t.fromTeam}</span>
                      <span className="text-fc-muted"> ↔ </span>
                      <span className="font-semibold">{t.toTeam}</span>
                      <p className="text-xs text-fc-muted mt-1">
                        {t.playersOffered} offered · {t.playersRequested} requested
                        {t.cashAdjustment !== 0 && ` · ${formatMoney(Math.abs(t.cashAdjustment))} cash`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {data.loanHistory.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-bold text-fc-gold mb-3">Loans</h2>
                <div className="space-y-2">
                  {data.loanHistory.slice(0, 15).map((l) => (
                    <div key={l.id} className="fc-card px-4 py-3 text-sm">
                      <span className="font-semibold">{l.playerName}</span>
                      <p className="text-xs text-fc-muted mt-1">
                        {l.lenderTeam} → {l.borrowerTeam} · {l.fixturesPlayed}/{l.fixturesTotal} fixtures
                        {l.loanFee > 0 && ` · fee ${formatMoney(l.loanFee)}`}
                        {" · "}
                        <span className="text-fc-accent">{l.status}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </RoomLayoutShell>
  );
}
