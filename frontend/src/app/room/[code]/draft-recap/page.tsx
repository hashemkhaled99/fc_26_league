"use client";

import { apiPath, apiFetchInit, readApiJson } from "@/lib/api-base";
import { formatMoney } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingPulse } from "@/components/LoadingPulse";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";

type User = { id: string; displayName: string; teamName: string; budget?: number; isAdmin?: boolean };

type Recap = {
  biggestSpender: { userId: string; amount: number } | null;
  luckiest: { userId: string; avgRating: number } | null;
  unluckiest: { userId: string; avgRating: number } | null;
  auctionKing: { userId: string; wins: number } | null;
  bestValue: { userId: string; playerId: string; ratio: number } | null;
  overpaid: { userId: string; playerId: string; ratio: number } | null;
};

const AWARDS: Array<{
  key: keyof Recap;
  title: string;
  emoji: string;
  format: (v: NonNullable<Recap[keyof Recap]>, name: string) => string;
}> = [
  {
    key: "biggestSpender",
    title: "Biggest Spender",
    emoji: "💸",
    format: (v, name) => `${name} — ${formatMoney((v as { amount: number }).amount)}`,
  },
  {
    key: "luckiest",
    title: "Luckiest",
    emoji: "🍀",
    format: (v, name) => `${name} — avg ${(v as { avgRating: number }).avgRating.toFixed(1)} OVR`,
  },
  {
    key: "unluckiest",
    title: "Unluckiest",
    emoji: "💀",
    format: (v, name) => `${name} — avg ${(v as { avgRating: number }).avgRating.toFixed(1)} OVR`,
  },
  {
    key: "auctionKing",
    title: "Auction King",
    emoji: "🏆",
    format: (v, name) => `${name} — ${(v as { wins: number }).wins} wins`,
  },
  {
    key: "bestValue",
    title: "Best Value",
    emoji: "🎯",
    format: (v, name) => `${name}`,
  },
  {
    key: "overpaid",
    title: "Overpaid Award",
    emoji: "🤑",
    format: (v, name) => `${name}`,
  },
];

export default function DraftRecapPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const [users, setUsers] = useState<User[]>([]);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [roomName, setRoomName] = useState("Hero Draft");

  useEffect(() => {
    (async () => {
      try {
        const draftRes = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), apiFetchInit);
        const draft = await readApiJson<{
          room: { name: string };
          users: User[];
          me: User | null;
          error?: string;
        }>(draftRes);
        if (draftRes.status === 401) {
          router.replace("/");
          return;
        }
        setUsers(draft.users ?? []);
        setMe(draft.me);
        setRoomName(draft.room?.name ?? "Hero Draft");

        const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), {
          ...apiFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "show_recap" }),
        });
        const json = await readApiJson<{ recap: Recap; error?: string }>(res);
        if (!res.ok) throw new Error(json.error ?? "Failed to load recap");
        setRecap(json.recap);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [code, router]);

  useEffect(() => {
    if (!recap) return;
    if (step >= AWARDS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 2200);
    return () => clearTimeout(t);
  }, [recap, step]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">{error}</div>
    );
  }
  if (!recap) return <LoadingPulse label="Calculating draft awards..." />;

  const nameOf = (userId?: string) =>
    users.find((u) => u.id === userId)?.teamName ?? "Unknown";

  return (
    <RoomLayoutShell
      code={code}
      roomName={roomName}
      phase="draft_recap"
      teamName={me?.teamName}
      budget={me?.budget}
      isAdmin={me?.isAdmin}
    >
      <div className="mx-auto max-w-lg space-y-8 text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-fc-muted">End of draft</p>
          <h2 className="font-display text-4xl font-bold text-fc-gold mt-2">Draft Recap</h2>
        </div>

        <div className="min-h-[220px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {step < AWARDS.length && (() => {
              const award = AWARDS[step];
              const value = recap[award.key];
              if (!value) {
                return (
                  <motion.p
                    key={award.key}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    className="text-fc-muted"
                  >
                    {award.title}: n/a
                  </motion.p>
                );
              }
              const uid =
                "userId" in value ? value.userId : undefined;
              return (
                <motion.div
                  key={award.key}
                  initial={{ opacity: 0, scale: 0.85, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.05, y: -20 }}
                  transition={{ type: "spring", stiffness: 220, damping: 18 }}
                  className="rounded-2xl border border-fc-gold/30 bg-gradient-to-b from-fc-gold/10 to-transparent px-8 py-10 w-full"
                >
                  <p className="text-4xl mb-3">{award.emoji}</p>
                  <p className="font-display text-xl text-fc-gold font-bold">{award.title}</p>
                  <p className="mt-3 text-lg text-white">
                    {award.format(value, nameOf(uid))}
                  </p>
                </motion.div>
              );
            })()}
            {step >= AWARDS.length && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <p className="font-display text-2xl text-white">All awards revealed</p>
                <button
                  className="fc-btn-primary"
                  onClick={() => router.push(`/room/${code}/squad`)}
                >
                  View squad
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-2">
          {AWARDS.map((a, i) => (
            <span
              key={a.key}
              className={`h-1.5 w-6 rounded-full ${i < step ? "bg-fc-gold" : "bg-white/15"}`}
            />
          ))}
        </div>
      </div>
    </RoomLayoutShell>
  );
}
