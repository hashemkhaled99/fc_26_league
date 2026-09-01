"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { formatMoney } from "@/lib/utils";
import { onBudgetUpdated } from "@/lib/room-socket";
import { getPublicSocketUrl } from "@/lib/public-env";

interface CardRow {
  id: string;
  type: string;
  category: string;
  used: boolean;
  name: string;
  description: string;
  rarity: string;
  target: string;
}

interface Data {
  room: { code: string; name: string; phase: string };
  user: { id: string; teamName: string; budget: number; isAdmin: boolean };
  cards: CardRow[];
  targets: {
    auctions: Array<{
      id: string;
      label: string;
      isResale: boolean;
      sellerId: string | null;
      currentBidderId: string | null;
    }>;
    matches: Array<{ id: string; label: string }>;
    users: Array<{ id: string; teamName: string; displayName: string }>;
    squad: Array<{ id: string; label: string; boosted: boolean }>;
    availablePlayers: Array<{
      id: string;
      name: string;
      position: string;
      baseRating: number;
      realTeam: string;
    }>;
  };
}

const RARITY: Record<string, string> = {
  common: "border-white/20 bg-fc-charcoal/60",
  rare: "border-fc-accent/40 bg-fc-accent/10",
  epic: "border-fc-gold/50 bg-fc-gold/10 shadow-glow",
};

export function CardsClient({ code }: { code: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<CardRow | null>(null);
  const [auctionId, setAuctionId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [rivalSquad, setRivalSquad] = useState<Array<{ id: string; label: string }>>([]);
  const [tab, setTab] = useState<"transfer" | "fixture">("transfer");
  const [matchId, setMatchId] = useState("");
  const [reveal, setReveal] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/cards`), apiFetchInit);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load cards");
    return json as Data;
  }, [code]);

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    import("socket.io-client").then(({ io }) => {
      const socket = io(socketUrl, { transports: ["websocket", "polling"] });
      socket.on("connect", () => socket.emit("room:join", { roomCode: code }));
      onBudgetUpdated(socket, () => load().then(setData).catch(() => undefined));
      return () => socket.disconnect();
    });
  }, [code, load]);

  useEffect(() => {
    if (!targetUserId || !active) {
      setRivalSquad([]);
      return;
    }
    if (active.type !== "clone" && active.type !== "boost_steal") return;
    fetch(apiPath(`/api/rooms/${code}/users/${targetUserId}/squad`), apiFetchInit)
      .then((r) => r.json())
      .then((j) => {
        const squad = (j.squad ?? []) as Array<{
          id: string;
          name: string;
          position: string;
          baseRating: number;
          boostedRating?: number;
          boostedStats?: Array<{ label: string; bump: number }>;
        }>;
        setRivalSquad(
          squad.map((p) => {
            const rating = p.boostedRating ?? p.baseRating;
            const stats = (p.boostedStats ?? [])
              .map((s) => `${s.label}+${s.bump}`)
              .join(" ");
            return {
              id: p.id,
              label: stats
                ? `${p.name} · ${p.position} ${rating} · ${stats}`
                : `${p.name} · ${p.position} ${rating}`,
            };
          })
        );
      })
      .catch(() => setRivalSquad([]));
  }, [targetUserId, active, code]);

  async function play() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/cards`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: active.id,
          auctionId: auctionId || undefined,
          playerId: playerId || undefined,
          targetUserId: targetUserId || undefined,
          ownPlayerId: ownPlayerId || undefined,
          matchId: matchId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setReveal(json.result);
      setActive(null);
      setToast(`${active.name} played!`);
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
        Loading cards...
      </div>
    );
  }

  const unused = data.cards.filter((c) => !c.used && c.category === tab);
  const used = data.cards.filter((c) => c.used && c.category === tab);
  const phaseHint =
    tab === "transfer"
      ? data.room.phase === "bidding"
        ? "Play during the transfer window."
        : "Transfer cards only work in bidding phase."
      : data.room.phase === "league"
        ? "3 cards for the whole league — spend them wisely."
        : "Fixture cards unlock when the league starts.";

  const needsAuction =
    active &&
    (active.target === "auction" ||
      active.type === "bid_ban" ||
      active.type === "sniper_guard" ||
      active.type === "time_warp" ||
      active.type === "exclusive_rights" ||
      active.type === "freeze_auction" ||
      active.type === "bid_shield");
  const needsAvailable =
    active &&
    (active.target === "player_available" ||
      active.type === "first_dibs" ||
      active.type === "price_trap" ||
      active.type === "blacklist");
  const needsOwn = active && (active.target === "own_squad" || active.type === "panic_sell");
  const needsUser =
    active &&
    (active.target === "user" ||
      active.type === "bid_ban" ||
      active.type === "budget_peek" ||
      active.type === "clone" ||
      active.type === "boost_steal");

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

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="fc-card w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-xl font-bold text-fc-gold">{active.name}</h3>
            <p className="text-sm text-fc-muted">{active.description}</p>

            {needsAuction && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Auction</span>
                <select className="fc-input mt-1" value={auctionId} onChange={(e) => setAuctionId(e.target.value)}>
                  <option value="">Select…</option>
                  {data.targets.auctions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needsUser && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Rival</span>
                <select
                  className="fc-input mt-1"
                  value={targetUserId}
                  onChange={(e) => {
                    setTargetUserId(e.target.value);
                    setPlayerId("");
                  }}
                >
                  <option value="">Select…</option>
                  {data.targets.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.teamName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needsAvailable && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Available player</span>
                <select className="fc-input mt-1" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                  <option value="">Select…</option>
                  {data.targets.availablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.position} {p.baseRating}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needsOwn && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Your player</span>
                <select className="fc-input mt-1" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                  <option value="">Select…</option>
                  {data.targets.squad.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(active.type === "clone" || active.type === "boost_steal") && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Their player</span>
                <select className="fc-input mt-1" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                  <option value="">Select rival first…</option>
                  {rivalSquad.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {active.type === "boost_steal" && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Apply boost to (yours)</span>
                <select
                  className="fc-input mt-1"
                  value={ownPlayerId}
                  onChange={(e) => setOwnPlayerId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {data.targets.squad.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {active.target === "match" && (
              <label className="block text-sm">
                <span className="text-xs text-fc-muted uppercase">Your fixture</span>
                <select className="fc-input mt-1" value={matchId} onChange={(e) => setMatchId(e.target.value)}>
                  <option value="">Select…</option>
                  {(data.targets.matches ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button type="button" className="fc-btn-secondary flex-1" onClick={() => setActive(null)}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="fc-btn-primary flex-1" onClick={play}>
                {busy ? "Playing..." : "Use card"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reveal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setReveal(null)}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="fc-card max-w-md w-full p-6 border-fc-gold/40 shadow-glow"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-bold text-fc-gold">Card result</h3>
            {"amount" in reveal && typeof reveal.amount === "number" && (
              <p className="mt-3 text-fc-green font-mono text-2xl">{formatMoney(reveal.amount)}</p>
            )}
            {"message" in reveal && (
              <p className="mt-3 text-sm text-white">{String(reveal.message)}</p>
            )}
            {"players" in reveal && Array.isArray(reveal.players) && (
              <ul className="mt-3 space-y-1 text-sm">
                {(
                  reveal.players as Array<{ name: string; baseRating: number; position: string }>
                ).map((p, i) => (
                  <li key={i}>
                    {p.baseRating} {p.name} · {p.position}
                  </li>
                ))}
              </ul>
            )}
            {"availableBudget" in reveal && (
              <p className="mt-3 text-sm">
                {String(reveal.teamName)} available:{" "}
                <span className="text-fc-green font-mono">
                  {formatMoney(Number(reveal.availableBudget))}
                </span>
              </p>
            )}
            {"playerName" in reveal && (
              <p className="mt-3 text-sm text-fc-gold">{String(reveal.playerName)}</p>
            )}
            <button type="button" className="fc-btn-primary w-full mt-4" onClick={() => setReveal(null)}>
              Nice
            </button>
          </motion.div>
        </div>
      )}

      <div className="space-y-6">
        <GlowCard glow="gold">
          <h1 className="font-display text-2xl font-bold text-fc-gold">Cards</h1>
          <p className="text-sm text-fc-muted mt-1">{phaseHint}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                tab === "transfer" ? "bg-fc-gold text-fc-navy" : "bg-fc-charcoal text-fc-muted"
              }`}
              onClick={() => setTab("transfer")}
            >
              Transfer ({data.cards.filter((c) => !c.used && c.category === "transfer").length})
            </button>
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                tab === "fixture" ? "bg-fc-gold text-fc-navy" : "bg-fc-charcoal text-fc-muted"
              }`}
              onClick={() => setTab("fixture")}
            >
              Fixtures ({data.cards.filter((c) => !c.used && c.category === "fixture").length})
            </button>
          </div>
        </GlowCard>

        {unused.length === 0 ? (
          <GlowCard>
            <p className="text-fc-muted text-center py-6">
              No unused cards. Admin can hit <span className="text-fc-gold">Distribute Cards</span>{" "}
              or start a new bidding phase.
            </p>
          </GlowCard>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {unused.map((c, i) => (
              <motion.button
                key={c.id}
                type="button"
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => {
                  setActive(c);
                  setAuctionId("");
                  setPlayerId("");
                  setTargetUserId("");
                  setOwnPlayerId("");
                  setMatchId("");
                  setError("");
                }}
                className={`rounded-xl border p-5 text-left transition hover:scale-[1.02] ${RARITY[c.rarity] ?? RARITY.common}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold">{c.name}</h2>
                  <span className="text-[10px] uppercase tracking-wide text-fc-muted">{c.rarity}</span>
                </div>
                <p className="mt-2 text-sm text-fc-muted">{c.description}</p>
                <p className="mt-3 text-xs font-semibold text-fc-gold">Tap to play →</p>
              </motion.button>
            ))}
          </div>
        )}

        {used.length > 0 && (
          <GlowCard>
            <h2 className="font-display text-lg font-semibold mb-3">Used</h2>
            <div className="space-y-2 opacity-60">
              {used.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-semibold">{c.name}</span>
                </div>
              ))}
            </div>
          </GlowCard>
        )}
      </div>
    </RoomLayoutShell>
  );
}
