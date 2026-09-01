"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { onBudgetUpdated } from "@/lib/room-socket";

interface AwardRow {
  type: string;
  title: string;
  emoji: string;
  blurb: string;
  userId: string;
  teamName: string;
  displayName: string;
  value: string;
  isYou: boolean;
}

interface Data {
  room: { code: string; name: string; phase: string; season: number };
  user: { id: string; teamName: string; budget: number; isAdmin: boolean };
  awards: AwardRow[];
}

export function AwardsClient({ code }: { code: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/awards`), apiFetchInit);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load awards");
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
      onBudgetUpdated(socket, () => load().then(setData).catch(() => undefined));
      return () => socket.disconnect();
    });
  }, [code, load]);

  useEffect(() => {
    if (!data || data.awards.length === 0 || done) return;
    if (index >= data.awards.length - 1) return;
    const t = setTimeout(() => setIndex((i) => i + 1), 3200);
    return () => clearTimeout(t);
  }, [data, index, done]);

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fc-gold font-display text-xl">
        Loading awards...
      </div>
    );
  }

  if (data.room.phase !== "season_end" && data.awards.length === 0) {
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
            Awards unlock when admin clicks <span className="text-fc-gold">End Season</span>.
          </p>
        </GlowCard>
      </RoomLayoutShell>
    );
  }

  const current = data.awards[Math.min(index, Math.max(0, data.awards.length - 1))];
  const showAll = done || data.awards.length === 0;

  return (
    <RoomLayoutShell
      code={data.room.code}
      roomName={data.room.name}
      phase={data.room.phase}
      teamName={data.user.teamName}
      budget={data.user.budget}
      isAdmin={data.user.isAdmin}
    >
      <div className="space-y-6">
        <GlowCard glow="gold">
          <h1 className="font-display text-2xl font-bold text-fc-gold">
            Season {data.room.season} Awards
          </h1>
          <p className="text-sm text-fc-muted mt-1">End-of-season ceremony</p>
        </GlowCard>

        {!showAll && current && (
          <div className="relative min-h-[320px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.type}
                initial={{ opacity: 0, scale: 0.7, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.1, y: -30 }}
                transition={{ type: "spring", stiffness: 160, damping: 16 }}
                className={`w-full max-w-lg rounded-2xl border p-8 text-center ${
                  current.isYou
                    ? "border-fc-gold bg-fc-gold/15 shadow-glow"
                    : "border-white/10 bg-fc-card"
                }`}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: "spring" }}
                  className="text-6xl mb-4"
                >
                  {current.emoji}
                </motion.div>
                <p className="text-xs uppercase tracking-[0.2em] text-fc-muted">{current.blurb}</p>
                <h2 className="font-display text-3xl font-bold text-fc-gold mt-2">{current.title}</h2>
                <p className="mt-4 text-xl font-semibold">{current.teamName}</p>
                <p className="text-sm text-fc-muted">{current.displayName}</p>
                <p className="mt-3 font-mono text-fc-green">{current.value}</p>
                {current.isYou && (
                  <p className="mt-4 text-sm font-bold text-fc-gold">That&apos;s you!</p>
                )}
                <p className="mt-6 text-xs text-fc-muted">
                  {index + 1} / {data.awards.length}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-center">
          {!showAll && (
            <>
              <button
                type="button"
                className="fc-btn-secondary text-sm"
                onClick={() => setIndex((i) => Math.min(i + 1, data.awards.length - 1))}
              >
                Next
              </button>
              <button type="button" className="fc-btn-primary text-sm" onClick={() => setDone(true)}>
                Skip to all
              </button>
            </>
          )}
          {showAll && (
            <button type="button" className="fc-btn-secondary text-sm" onClick={() => { setDone(false); setIndex(0); }}>
              Replay ceremony
            </button>
          )}
        </div>

        {showAll && (
          <GlowCard>
            <h2 className="font-display text-lg font-semibold mb-4">All awards</h2>
            <div className="space-y-3">
              {data.awards.map((a) => (
                <div
                  key={a.type}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    a.isYou ? "border-fc-gold/40 bg-fc-gold/10" : "border-white/5 bg-fc-charcoal/50"
                  }`}
                >
                  <span className="text-2xl">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-sm text-fc-muted truncate">
                      {a.teamName} · {a.value}
                    </p>
                  </div>
                </div>
              ))}
              {data.awards.length === 0 && (
                <p className="text-fc-muted text-sm">No awards recorded for this season.</p>
              )}
            </div>
            {data.user.isAdmin && (
              <p className="mt-4 text-sm text-fc-muted">
                Ready for the next cycle? Go to{" "}
                <Link href={`/room/${code}/admin`} className="text-fc-gold hover:underline">
                  Admin → Start New Season
                </Link>
              </p>
            )}
          </GlowCard>
        )}
      </div>
    </RoomLayoutShell>
  );
}
