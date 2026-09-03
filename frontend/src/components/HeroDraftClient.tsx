"use client";

import { apiPath, apiFetchInit, readApiJson } from "@/lib/api-base";
import { formatMoney } from "@/lib/utils";
import { getPublicSocketUrl } from "@/lib/public-env";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingPulse } from "@/components/LoadingPulse";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { TierPlayerCard, type DraftPlayer } from "@/components/TierPlayerCard";
import Link from "next/link";

type DraftUser = {
  id: string;
  displayName: string;
  teamName: string;
  budget: number;
  isAdmin: boolean;
};

type DraftState = {
  status: string;
  currentRound: number;
  currentSlotIndex: number | null;
  currentTurnHolderId: string | null;
  currentRoundTurnUserId: string | null;
  currentRoundTurnExpiresAt: string | null;
  currentRoundHighestBid: number | null;
  currentRoundHighestBidderId: string | null;
  currentRoundActiveBidders: string[];
  currentRoundPassedBidders: string[];
  filledSlotIndexes: number[];
  pendingReleaseUserIds: string[];
  biddingOrder: string[];
  turnQueue: string[];
  goldenRoundIndex: number | null;
  tradeWindowEndsAt: string | null;
};

type DraftPayload = {
  room: { id: string; code: string; name: string; mode: string; phase: string };
  settings: { bidTurnTimeoutSeconds: number; turnHolderMustOpenBid: boolean } | null;
  state: DraftState | null;
  users: DraftUser[];
  auctionedPlayer: DraftPlayer | null;
  mySquad: Array<{ id: string; draftSlotIndex: number | null; purchasePrice: number; player: DraftPlayer }>;
  me: DraftUser | null;
  error?: string;
};

type RevealPayload = {
  playerId: string;
  tier: string;
  rating: number;
  deductionAmount: number;
  deductionType: string;
  roundIndex: number;
};

type ReleasePrompt = {
  requiredAmount: number;
  budget: number;
  playerId: string;
};

function useCountdown(expiresAt: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) {
      setLeft(0);
      return;
    }
    const tick = () => {
      setLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

export function HeroDraftClient() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const [data, setData] = useState<DraftPayload | null>(null);
  const [error, setError] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [acting, setActing] = useState(false);
  const [goldenFlash, setGoldenFlash] = useState(false);
  const [releasePrompt, setReleasePrompt] = useState<ReleasePrompt | null>(null);
  const [feed, setFeed] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), apiFetchInit);
    if (res.status === 401) {
      router.replace("/");
      throw new Error("Session expired");
    }
    const payload = await readApiJson<DraftPayload>(res);
    if (!res.ok) throw new Error(payload.error ?? "Failed to load draft");
    setData(payload);
    if (payload.state?.currentRoundHighestBid) {
      setBidAmount(String(payload.state.currentRoundHighestBid + 1_000_000));
    } else {
      // Opening bid: leave blank so the turn holder chooses freely (not forced to market value)
      setBidAmount("");
    }
    return payload;
  }, [code, router]);

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
      const reload = () => load().catch(() => undefined);
      s.on("round:started", reload);
      s.on("bidTurn:started", reload);
      s.on("bidTurn:bidPlaced", (p: { userId: string; amount: number }) => {
        setFeed((f) => [`Bid ${formatMoney(p.amount)}`, ...f].slice(0, 8));
        reload();
      });
      s.on("bidTurn:passed", (p: { userId: string }) => {
        setFeed((f) => [`Pass`, ...f].slice(0, 8));
        reload();
      });
      s.on("bidTurn:autoPassed", reload);
      s.on("auction:closed", reload);
      s.on("round:completed", reload);
      s.on("round:goldenAnnounced", () => {
        setGoldenFlash(true);
        setTimeout(() => setGoldenFlash(false), 4000);
      });
      s.on("randomRoll:revealed", (p: RevealPayload & { userId: string }) => {
        load().then((fresh) => {
          if (fresh.me?.id === p.userId) {
            const player = fresh.mySquad.find((sp) => sp.player.id === p.playerId)?.player;
            const payload = { ...p, player };
            try {
              sessionStorage.setItem("heroDraftReveal", JSON.stringify(payload));
            } catch {
              /* ignore */
            }
            router.push(`/room/${code}/draft/reveal`);
          }
        });
      });
      s.on("randomRoll:insufficientFunds", (p: ReleasePrompt & { userId: string }) => {
        load().then((fresh) => {
          if (fresh.me?.id === p.userId) setReleasePrompt(p);
        });
      });
      s.on("draft:completed", (p: { next: string }) => {
        if (p.next === "trade_window") router.push(`/room/${code}/trade-window`);
        else router.push(`/room/${code}/draft-recap`);
      });
      s.on("tradeWindow:started", () => router.push(`/room/${code}/trade-window`));
      s.on("draftRecap:ready", () => router.push(`/room/${code}/draft-recap`));
    });
    return () => socket?.disconnect();
  }, [code, load, router]);

  const secondsLeft = useCountdown(data?.state?.currentRoundTurnExpiresAt ?? null);
  const isMyTurn = data?.me?.id && data.state?.currentRoundTurnUserId === data.me.id;
  const usersById = useMemo(() => {
    const m = new Map<string, DraftUser>();
    data?.users.forEach((u) => m.set(u.id, u));
    return m;
  }, [data?.users]);

  async function act(body: Record<string, unknown>) {
    setActing(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }
  if (!data) return <LoadingPulse label="Loading Hero Draft..." />;

  const { room, state, auctionedPlayer, me } = data;
  if (!state || state.status === "not_started") {
    return (
      <RoomLayoutShell code={room.code} roomName={room.name} phase={room.phase} teamName={me?.teamName} budget={me?.budget} isAdmin={me?.isAdmin}>
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <h2 className="font-display text-3xl font-bold text-fc-gold">Hero Draft</h2>
          <p className="text-fc-muted">Waiting for admin to start the draft.</p>
          {me?.isAdmin && (
            <button className="fc-btn-primary" disabled={acting} onClick={() => act({ action: "start" })}>
              {acting ? "Starting..." : "Start Draft"}
            </button>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Link href={`/room/${code}/lobby`} className="block text-sm text-fc-accent">
            ← Back to lobby
          </Link>
        </div>
      </RoomLayoutShell>
    );
  }

  const turnName = state.currentRoundTurnUserId
    ? usersById.get(state.currentRoundTurnUserId)?.teamName ?? "…"
    : "—";
  const holderName = state.currentTurnHolderId
    ? usersById.get(state.currentTurnHolderId)?.teamName ?? "…"
    : "—";

  return (
    <RoomLayoutShell
      code={room.code}
      roomName={room.name}
      phase={room.phase}
      teamName={me?.teamName}
      budget={me?.budget}
      isAdmin={me?.isAdmin}
    >
      <AnimatePresence>
        {goldenFlash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-none"
          >
            <motion.p
              initial={{ scale: 0.6, y: 20 }}
              animate={{ scale: 1.1, y: 0 }}
              className="font-display text-5xl md:text-7xl font-black text-fc-gold drop-shadow-[0_0_40px_rgba(245,197,24,0.8)]"
            >
              GOLDEN ROUND
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-fc-muted">
                Round {state.currentRound + 1} / 18 · Slot {(state.currentSlotIndex ?? 0) + 1}
              </p>
              <h2 className="font-display text-2xl font-bold text-white">Live Draft</h2>
            </div>
            <div className="rounded-xl border border-white/10 bg-fc-charcoal/60 px-4 py-2 text-right">
              <p className="text-xs text-fc-muted">Turn timer</p>
              <p className={`font-mono text-2xl font-bold ${secondsLeft <= 5 ? "text-red-400" : "text-fc-gold"}`}>
                {secondsLeft}s
              </p>
            </div>
          </div>

          {auctionedPlayer ? (
            <TierPlayerCard player={auctionedPlayer} size="lg" highlight />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-fc-muted">
              Waiting for next round…
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-fc-card/50 p-4 space-y-2">
            <p className="text-sm text-fc-muted">
              Turn holder: <span className="text-white font-semibold">{holderName}</span>
            </p>
            <p className="text-sm">
              Now bidding:{" "}
              <span className={`font-semibold ${isMyTurn ? "text-fc-gold" : "text-white"}`}>{turnName}</span>
              {isMyTurn && <span className="ml-2 text-xs text-fc-gold animate-pulse">YOUR TURN</span>}
            </p>
            <p className="font-mono text-lg text-fc-green">
              Highest: {state.currentRoundHighestBid != null ? formatMoney(state.currentRoundHighestBid) : "—"}
            </p>
          </div>

          {isMyTurn && (
            <div className="rounded-xl border border-fc-gold/30 bg-fc-gold/5 p-4 space-y-3">
              <label className="block text-sm text-fc-muted">
                {state.currentRoundHighestBid == null
                  ? "Your opening bid (any amount you choose)"
                  : "Your bid (must beat current highest)"}
              </label>
              <input
                className="fc-input font-mono"
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                min={1}
                placeholder={
                  state.currentRoundHighestBid == null
                    ? "Enter opening amount…"
                    : undefined
                }
              />
              <div className="flex gap-3">
                <button
                  className="fc-btn-primary flex-1"
                  disabled={acting || !bidAmount || Number(bidAmount) <= 0}
                  onClick={() => act({ action: "bid", amount: Number(bidAmount) })}
                >
                  {state.currentRoundHighestBid == null ? "Open bid" : "Raise"}
                </button>
                <button
                  className="fc-btn-secondary flex-1"
                  disabled={acting}
                  onClick={() => act({ action: "pass" })}
                >
                  Pass
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {releasePrompt && (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 space-y-3">
              <h3 className="font-display font-bold text-red-300">Insufficient funds</h3>
              <p className="text-sm text-fc-muted">
                Need {formatMoney(releasePrompt.requiredAmount)} — you have {formatMoney(releasePrompt.budget)}.
                Release an earlier player to continue.
              </p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {data.mySquad
                  .filter((sp) => sp.player.id !== releasePrompt.playerId)
                  .map((sp) => (
                    <li key={sp.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                      <span className="text-sm">
                        {sp.player.name}{" "}
                        <span className="text-fc-muted">({formatMoney(sp.purchasePrice)})</span>
                      </span>
                      <button
                        className="text-xs font-bold text-red-300 border border-red-400/40 rounded px-2 py-1"
                        disabled={acting}
                        onClick={async () => {
                          await act({ action: "release", squadPlayerId: sp.id });
                          setReleasePrompt(null);
                        }}
                      >
                        Release
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-fc-card/40 p-4">
            <h3 className="font-display font-semibold mb-3">Active bidders</h3>
            <ul className="space-y-1.5">
              {state.biddingOrder.map((id) => {
                const u = usersById.get(id);
                const passed = state.currentRoundPassedBidders.includes(id);
                const active = state.currentRoundActiveBidders.includes(id);
                return (
                  <li
                    key={id}
                    className={`flex justify-between text-sm px-2 py-1.5 rounded ${
                      id === state.currentRoundTurnUserId ? "bg-fc-gold/15 text-fc-gold" : ""
                    } ${passed ? "opacity-40 line-through" : ""}`}
                  >
                    <span>{u?.teamName ?? id.slice(0, 6)}</span>
                    <span className="text-fc-muted text-xs">{active ? "in" : "out"}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-fc-card/40 p-4">
            <h3 className="font-display font-semibold mb-3">Bid feed</h3>
            <ul className="space-y-1 text-sm text-fc-muted">
              {feed.length === 0 && <li>No bids yet</li>}
              {feed.map((line, i) => (
                <li key={`${line}-${i}`}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-fc-card/40 p-4">
            <h3 className="font-display font-semibold mb-2">Your squad</h3>
            <p className="text-xs text-fc-muted mb-2">{data.mySquad.length} / 18 filled</p>
            <ul className="space-y-1 max-h-56 overflow-y-auto text-sm">
              {data.mySquad.map((sp) => (
                <li key={sp.id} className="flex justify-between gap-2">
                  <span>
                    #{(sp.draftSlotIndex ?? 0) + 1} {sp.player.name}
                  </span>
                  <span className="text-fc-muted">{sp.player.baseRating}</span>
                </li>
              ))}
            </ul>
          </div>

          {me?.isAdmin && (
            <button
              className="fc-btn-secondary w-full text-sm"
              disabled={acting}
              onClick={() => act({ action: "force_advance" })}
            >
              Force advance turn
            </button>
          )}
        </div>
      </div>
    </RoomLayoutShell>
  );
}
