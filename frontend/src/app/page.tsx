"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GlowCard } from "@/components/GlowCard";

type Mode = "choose" | "create" | "join";

const FEATURES = [
  { icon: "⚡", text: "Live auction bidding" },
  { icon: "🃏", text: "Transfer & fixture power cards" },
  { icon: "🏆", text: "Full league season" },
];

export default function HomePage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [pin, setPin] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/rooms/create"), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName,
          displayName,
          teamName,
          pin: pin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create room");
      router.push(`/room/${data.code}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/rooms/join"), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          displayName,
          teamName,
          pin: pin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join room");
      router.push(`/room/${data.code}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: reduced ? 1 : 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.5, type: "spring", stiffness: 200, damping: 22 }}
        className="mb-10 text-center max-w-lg"
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-fc-accent mb-3">
          FC26 Friend League
        </p>
        <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
          <span className="fc-gradient-text">FC26</span>
        </h1>
        <p className="mt-2 font-display text-2xl md:text-3xl font-semibold text-white/90">
          Auction League
        </p>
        <p className="mt-4 text-fc-muted leading-relaxed">
          Build your squad in a live auction market. Play matches in FC26. Win the league.
        </p>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduced ? 0 : 0.2, staggerChildren: 0.06 }}
          className="mt-6 flex flex-wrap justify-center gap-3"
        >
          {FEATURES.map((f, i) => (
            <motion.li
              key={f.text}
              initial={{ opacity: 0, y: reduced ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.25 + i * 0.06 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-fc-card/60 px-3 py-1.5 text-xs text-fc-muted"
            >
              <span>{f.icon}</span>
              {f.text}
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {mode === "choose" && (
            <motion.div
              key="choose"
              initial={reduced ? false : { opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: 16 }}
              transition={{ duration: 0.25 }}
            >
              <GlowCard glow="gold" className="space-y-4">
                <button
                  onClick={() => setMode("create")}
                  className="fc-btn-primary w-full text-lg"
                >
                  Create Room
                </button>
                <button
                  onClick={() => setMode("join")}
                  className="fc-btn-secondary w-full text-lg"
                >
                  Join with Code
                </button>
              </GlowCard>
            </motion.div>
          )}

          {mode === "create" && (
            <motion.div
              key="create"
              initial={reduced ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              <GlowCard>
                <h2 className="font-display text-xl font-bold text-fc-gold mb-4">
                  Create Your League
                </h2>
                <form onSubmit={handleCreate} className="space-y-3">
                  <input
                    className="fc-input"
                    placeholder="League name (e.g. Weekend Warriors)"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    required
                  />
                  <input
                    className="fc-input"
                    placeholder="Your display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                  <input
                    className="fc-input"
                    placeholder="Your team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                  <input
                    className="fc-input"
                    placeholder="PIN (optional, 4-8 chars)"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    minLength={4}
                    maxLength={8}
                  />
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-sm"
                    >
                      {error}
                    </motion.p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setMode("choose")}
                      className="fc-btn-secondary flex-1"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="fc-btn-primary flex-1"
                    >
                      {loading ? "Creating..." : "Create"}
                    </button>
                  </div>
                </form>
              </GlowCard>
            </motion.div>
          )}

          {mode === "join" && (
            <motion.div
              key="join"
              initial={reduced ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              <GlowCard>
                <h2 className="font-display text-xl font-bold text-fc-gold mb-4">
                  Join a League
                </h2>
                <form onSubmit={handleJoin} className="space-y-3">
                  <input
                    className="fc-input font-mono uppercase"
                    placeholder="Room code (e.g. FC26-7XQ2)"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    required
                  />
                  <input
                    className="fc-input"
                    placeholder="Your display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                  <input
                    className="fc-input"
                    placeholder="Your team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                  <input
                    className="fc-input"
                    placeholder="PIN (optional)"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    minLength={4}
                    maxLength={8}
                  />
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-sm"
                    >
                      {error}
                    </motion.p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setMode("choose")}
                      className="fc-btn-secondary flex-1"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="fc-btn-primary flex-1"
                    >
                      {loading ? "Joining..." : "Join"}
                    </button>
                  </div>
                </form>
              </GlowCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
