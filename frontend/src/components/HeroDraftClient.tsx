"use client";

import { apiPath, apiFetchInit, apiFetch, readApiJson } from "@/lib/api-base";
import { formatMoney } from "@/lib/utils";
import { getPublicSocketUrl } from "@/lib/public-env";
import { getTierVisual, parseAllTimePlayer, DRAFT_SLOT_LABELS } from "@/lib/hero-draft-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type ReleasePrompt = {
  requiredAmount: number;
  budget: number;
  playerId: string;
  unpaidSlotIndex?: number | null;
};

type DraftPayload = {
  room: { id: string; code: string; name: string; mode: string; phase: string };
  settings: { bidTurnTimeoutSeconds: number; turnHolderMustOpenBid: boolean } | null;
  state: DraftState | null;
  users: DraftUser[];
  auctionedPlayer: DraftPlayer | null;
  mySquad: Array<{
    id: string;
    draftSlotIndex: number | null;
    purchasePrice: number;
    draftAcquisition?: string | null;
    player: DraftPlayer;
  }>;
  me: DraftUser | null;
  pendingRelease: ReleasePrompt | null;
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
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [goldenFlash, setGoldenFlash] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), apiFetchInit);
    if (res.status === 401) {
      router.replace("/");
      throw new Error("Session expired");
    }
    const payload = await readApiJson<DraftPayload>(res);
    if (!res.ok) throw new Error(payload.error ?? "Failed to load draft");
    if (seq !== loadSeq.current) return payload;
    setData(payload);
    if (payload.state?.currentRoundHighestBid) {
      // Input is in millions — suggest 1M above current highest
      setBidAmount(String(payload.state.currentRoundHighestBid / 1_000_000 + 1));
    } else {
      // Opening bid: leave blank so the turn holder chooses freely
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
          if (fresh.me?.id !== p.userId) return;
          if (
            fresh.pendingRelease ||
            fresh.state?.pendingReleaseUserIds?.includes(p.userId)
          ) {
            return;
          }
          const player = fresh.mySquad.find((sp) => sp.player.id === p.playerId)?.player;
          const payload = { ...p, player };
          try {
            sessionStorage.setItem("heroDraftReveal", JSON.stringify(payload));
          } catch {
            /* ignore */
          }
          router.push(`/room/${code}/draft/reveal`);
        });
      });
      s.on("randomRoll:insufficientFunds", () => {
        load().catch(() => undefined);
      });
      s.on("squadSlot:downgraded", reload);
      s.on("budget:updated", reload);
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

  async function act(body: Record<string, unknown>, opts?: { squadPlayerId?: string }) {
    setActing(true);
    if (opts?.squadPlayerId) setReleasingId(opts.squadPlayerId);
    setError("");
    try {
      // Release can touch budget + pool; use a timeout so the UI never sticks on "…"
      const timeoutMs = body.action === "release" ? 45_000 : 20_000;
      const res = await apiFetch(
        `/api/rooms/${code}/hero-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeoutMs
      );
      const json = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(false);
      setReleasingId(null);
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
  const pendingIds = state.pendingReleaseUserIds ?? [];
  const awaitingReleases = state.status === "awaiting_releases" || pendingIds.length > 0;
  const iOweRelease = Boolean(me && pendingIds.includes(me.id));
  const releasePrompt =
    data.pendingRelease ??
    (iOweRelease && me
      ? {
          requiredAmount: 0,
          budget: me.budget,
          playerId: "",
          unpaidSlotIndex: state.currentSlotIndex,
        }
      : null);
  const shortfall = releasePrompt
    ? Math.max(0, releasePrompt.requiredAmount - releasePrompt.budget)
    : 0;
  const waitingNames = pendingIds
    .map((id) => usersById.get(id)?.teamName ?? "a manager")
    .join(", ");
  const releasableSquad = [...data.mySquad]
    .map((sp) => {
      // Block every unpaid random-roll (can stack if a prior round was skipped).
      const isUnpaidRoll =
        sp.draftAcquisition === "random_roll_unpaid" ||
        (!!releasePrompt?.playerId && sp.player.id === releasePrompt.playerId);
      const noRefund = sp.purchasePrice <= 0;
      return { ...sp, isUnpaidRoll, noRefund, canRelease: !isUnpaidRoll && !noRefund };
    })
    .sort((a, b) => b.purchasePrice - a.purchasePrice);

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

      {iOweRelease && releasePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-red-400/40 bg-fc-charcoal p-5 shadow-[0_0_40px_rgba(248,113,113,0.25)] space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-red-300">Budget shortfall</p>
              <h3 className="font-display text-2xl font-bold text-white mt-1">Release a player to continue</h3>
              <p className="text-sm text-fc-muted mt-2">
                {releasePrompt.requiredAmount > 0 ? (
                  <>
                    This round&apos;s roll costs {formatMoney(releasePrompt.requiredAmount)} but you only have{" "}
                    {formatMoney(releasePrompt.budget)}
                    {shortfall > 0 ? ` (need ${formatMoney(shortfall)} more)` : ""}.
                  </>
                ) : (
                  <>You cannot afford this round&apos;s roll with {formatMoney(releasePrompt.budget)}.</>
                )}{" "}
                Pick a squad player to release — they go back to the pool, you get the spent budget back,
                and that slot is filled with a Gold player.
              </p>
            </div>
            <ul className="space-y-2">
              {releasableSquad.map((sp) => {
                const visual = getTierVisual(sp.player.tier ?? "GOLD");
                return (
                  <li
                    key={sp.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">
                        {parseAllTimePlayer(sp.player.name, sp.player.realTeam).displayName}
                      </p>
                      <p className="text-xs text-fc-muted">
                        {DRAFT_SLOT_LABELS[sp.draftSlotIndex ?? -1] ?? `Slot ${(sp.draftSlotIndex ?? 0) + 1}`}
                        {" · "}
                        {sp.player.position}{" "}
                        <span className={`ml-1 rounded px-1.5 py-0.5 ${visual.badge}`}>{visual.label}</span>
                      </p>
                      {sp.isUnpaidRoll ? (
                        <p className="text-xs text-amber-300 mt-1">This round&apos;s unpaid roll — cannot release yet</p>
                      ) : sp.noRefund ? (
                        <p className="text-xs text-fc-muted mt-1">No budget to recover</p>
                      ) : (
                        <p className="text-xs text-fc-green mt-1">Refund {formatMoney(sp.purchasePrice)}</p>
                      )}
                    </div>
                    <button
                      className="shrink-0 text-xs font-bold text-red-200 border border-red-400/50 rounded-lg px-3 py-2 disabled:opacity-40"
                      disabled={acting || !sp.canRelease}
                      onClick={() =>
                        act(
                          { action: "release", squadPlayerId: sp.id },
                          { squadPlayerId: sp.id }
                        )
                      }
                    >
                      {releasingId === sp.id ? "…" : "Release"}
                    </button>
                  </li>
                );
              })}
            </ul>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {me?.isAdmin && (
              <button
                className="fc-btn-secondary w-full text-sm"
                disabled={acting}
                onClick={() => act({ action: "force_advance" })}
              >
                {acting ? "Working…" : "Admin: force skip releases"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-fc-muted">
                Round {state.currentRound + 1} / 18 · Slot {(state.currentSlotIndex ?? 0) + 1}
              </p>
              <h2 className="font-display text-2xl font-bold text-white">
                {awaitingReleases ? "Draft paused" : "Live Draft"}
              </h2>
            </div>
            {!awaitingReleases && (
              <div className="rounded-xl border border-white/10 bg-fc-charcoal/60 px-4 py-2 text-right">
                <p className="text-xs text-fc-muted">Turn timer</p>
                <p className={`font-mono text-2xl font-bold ${secondsLeft <= 5 ? "text-red-400" : "text-fc-gold"}`}>
                  {secondsLeft}s
                </p>
              </div>
            )}
          </div>

          {awaitingReleases && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 space-y-3">
              <div>
                <p className="font-display font-bold text-amber-200">Waiting for a budget release</p>
                <p className="text-sm text-fc-muted mt-1">
                  {iOweRelease
                    ? "You cannot afford this round's roll. Choose a squad player above to downgrade to Gold and recover budget."
                    : `${waitingNames || "A manager"} must release a squad player (downgrade to Gold) before the draft can continue.`}
                </p>
              </div>
              {me?.isAdmin && (
                <button
                  className="fc-btn-secondary text-sm"
                  disabled={acting}
                  onClick={() => act({ action: "force_advance" })}
                >
                  {acting ? "Working…" : "Admin: force skip releases"}
                </button>
              )}
            </div>
          )}

          {auctionedPlayer ? (
            <TierPlayerCard player={auctionedPlayer} size="lg" highlight />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-fc-muted">
              Waiting for next round…
            </div>
          )}

          {!awaitingReleases && (
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
          )}

          {isMyTurn && !awaitingReleases && (
            <div className="rounded-xl border border-fc-gold/30 bg-fc-gold/5 p-4 space-y-3">
              <label className="block text-sm text-fc-muted">
                {state.currentRoundHighestBid == null
                  ? "Opening bid (in millions — e.g. 5 = 5M)"
                  : "Your bid in millions (must beat current highest)"}
              </label>
              <div className="relative">
                <input
                  className="fc-input font-mono pr-10"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  min={0.5}
                  placeholder={
                    state.currentRoundHighestBid == null
                      ? "e.g. 5"
                      : undefined
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono font-bold text-fc-gold">
                  M
                </span>
              </div>
              {bidAmount && Number(bidAmount) > 0 && (
                <p className="text-xs text-fc-muted">
                  You will bid {formatMoney(Math.round(Number(bidAmount) * 1_000_000))}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  className="fc-btn-primary flex-1"
                  disabled={acting || !bidAmount || Number(bidAmount) <= 0}
                  onClick={() =>
                    act({
                      action: "bid",
                      amount: Math.round(Number(bidAmount) * 1_000_000),
                    })
                  }
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

          {error && !iOweRelease && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="space-y-4">
          {awaitingReleases ? (
            <div className="rounded-xl border border-amber-400/30 bg-fc-card/40 p-4">
              <h3 className="font-display font-semibold mb-3">Managers releasing</h3>
              <ul className="space-y-1.5">
                {pendingIds.map((id) => {
                  const u = usersById.get(id);
                  return (
                    <li key={id} className="flex justify-between text-sm px-2 py-1.5 rounded bg-amber-500/10 text-amber-200">
                      <span>{u?.teamName ?? id.slice(0, 6)}</span>
                      <span className="text-xs font-mono">
                        {u ? formatMoney(u.budget) : ""} · {id === me?.id ? "your turn" : "waiting"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
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
                      <span className="text-fc-muted text-xs font-mono">
                        {u ? formatMoney(u.budget) : ""} {active ? "in" : "out"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

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
            <ul className="space-y-1 max-h-64 overflow-y-auto text-sm">
              {DRAFT_SLOT_LABELS.map((label, index) => {
                const occupants = data.mySquad.filter((sp) => sp.draftSlotIndex === index);
                const sp = occupants[0];
                const extras = occupants.slice(1);
                const parsed = sp
                  ? parseAllTimePlayer(sp.player.name, sp.player.realTeam)
                  : null;
                return (
                  <li key={`slot-${index}`}>
                    <div className={`flex justify-between gap-2 ${sp ? "" : "opacity-40"}`}>
                      <span className="min-w-0 truncate">
                        <span className="inline-block w-[4.75rem] shrink-0 text-[11px] uppercase tracking-wide text-fc-muted">
                          {label}
                        </span>
                        {parsed ? parsed.displayName : "—"}
                        {parsed?.year != null ? (
                          <span className="text-fc-muted"> {parsed.year}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-fc-muted">{sp?.player.position ?? ""}</span>
                    </div>
                    {extras.map((extra) => {
                      const extraParsed = parseAllTimePlayer(extra.player.name, extra.player.realTeam);
                      return (
                        <div key={extra.id} className="flex justify-between gap-2 pl-[4.75rem] text-amber-200">
                          <span className="min-w-0 truncate">{extraParsed.displayName}</span>
                          <span className="shrink-0">{extra.player.position}</span>
                        </div>
                      );
                    })}
                  </li>
                );
              })}
              {data.mySquad
                .filter(
                  (sp) =>
                    sp.draftSlotIndex == null ||
                    sp.draftSlotIndex < 0 ||
                    sp.draftSlotIndex >= DRAFT_SLOT_LABELS.length
                )
                .map((sp) => {
                  const parsed = parseAllTimePlayer(sp.player.name, sp.player.realTeam);
                  return (
                    <li key={sp.id} className="flex justify-between gap-2 text-amber-200">
                      <span className="min-w-0 truncate">
                        <span className="inline-block w-[4.75rem] shrink-0 text-[11px] uppercase tracking-wide text-fc-muted">
                          Extra
                        </span>
                        {parsed.displayName}
                      </span>
                      <span className="shrink-0">{sp.player.position}</span>
                    </li>
                  );
                })}
            </ul>
          </div>

          {me?.isAdmin && (
            <button
              className="fc-btn-secondary w-full text-sm"
              disabled={acting}
              onClick={() => act({ action: "force_advance" })}
            >
              {awaitingReleases ? "Admin: force skip releases" : "Force advance turn"}
            </button>
          )}
        </div>
      </div>
    </RoomLayoutShell>
  );
}
