"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { formatMoney } from "@/lib/utils";
import { onBudgetUpdated } from "@/lib/room-socket";

interface PlayerChip {
  id: string;
  name: string;
  position: string;
  baseRating: number;
  realTeam: string;
  purchasePrice?: number;
}

interface Partner {
  id: string;
  displayName: string;
  teamName: string;
  budget: number;
}

interface TradeItem {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUser: Partner | null;
  toUser: Partner | null;
  offeredPlayers: PlayerChip[];
  requestedPlayers: PlayerChip[];
  offeredPlayerIds: string[];
  requestedPlayerIds: string[];
  cashAdjustment: number;
  status: string;
  createdAt: string;
}

interface TradesData {
  room: { code: string; name: string; phase: string };
  user: {
    id: string;
    displayName: string;
    teamName: string;
    budget: number;
    isAdmin: boolean;
  };
  tradingAllowed: boolean;
  partners: Partner[];
  mySquad: PlayerChip[];
  incoming: TradeItem[];
  outgoing: TradeItem[];
  history: TradeItem[];
}

type Tab = "inbox" | "create" | "history";

function PlayerToggle({
  player,
  selected,
  onToggle,
}: {
  player: PlayerChip;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? "border-fc-gold bg-fc-gold/15"
          : "border-white/10 bg-fc-charcoal/60 hover:border-white/25"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm">{player.name}</p>
          <p className="text-[10px] text-fc-muted">
            {player.position} · {player.realTeam}
          </p>
        </div>
        <span className="font-display font-bold text-fc-gold">{player.baseRating}</span>
      </div>
    </button>
  );
}

function TradeCard({
  trade,
  meId,
  onAccept,
  onReject,
  onCounter,
  busy,
}: {
  trade: TradeItem;
  meId: string;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  busy?: boolean;
}) {
  const iAmFrom = trade.fromUserId === meId;
  const statusColor =
    trade.status === "accepted"
      ? "text-fc-green"
      : trade.status === "rejected"
        ? "text-red-400"
        : trade.status === "countered"
          ? "text-fc-accent"
          : "text-fc-gold";

  return (
    <div className="fc-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">{trade.fromUser?.teamName ?? "?"}</span>
          <span className="text-fc-muted"> → </span>
          <span className="font-semibold">{trade.toUser?.teamName ?? "?"}</span>
        </p>
        <span className={`text-xs font-bold uppercase ${statusColor}`}>{trade.status}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase text-fc-muted mb-1">
            {iAmFrom ? "You offer" : "They offer"}
          </p>
          {trade.offeredPlayers.length === 0 ? (
            <p className="text-xs text-fc-muted">No players</p>
          ) : (
            <ul className="space-y-1">
              {trade.offeredPlayers.map((p) => (
                <li key={p.id} className="text-sm">
                  <span className="text-fc-gold font-mono text-xs mr-1">{p.baseRating}</span>
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-fc-muted mb-1">
            {iAmFrom ? "You want" : "They want"}
          </p>
          {trade.requestedPlayers.length === 0 ? (
            <p className="text-xs text-fc-muted">No players</p>
          ) : (
            <ul className="space-y-1">
              {trade.requestedPlayers.map((p) => (
                <li key={p.id} className="text-sm">
                  <span className="text-fc-gold font-mono text-xs mr-1">{p.baseRating}</span>
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {trade.cashAdjustment !== 0 && (
        <p className="text-sm text-fc-green font-mono">
          Cash: {trade.cashAdjustment > 0 ? "+" : ""}
          {formatMoney(trade.cashAdjustment)}{" "}
          <span className="text-fc-muted text-xs">
            ({trade.cashAdjustment > 0 ? "from sender" : "from recipient"})
          </span>
        </p>
      )}

      {(onAccept || onReject || onCounter) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onAccept && (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="fc-btn-primary px-4 py-2 text-sm"
            >
              Accept
            </button>
          )}
          {onCounter && (
            <button
              type="button"
              disabled={busy}
              onClick={onCounter}
              className="fc-btn-secondary px-4 py-2 text-sm"
            >
              Counter
            </button>
          )}
          {onReject && (
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-red-300 border border-red-400/30 hover:bg-red-400/10"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TradesPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [data, setData] = useState<TradesData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("inbox");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Create form
  const [partnerId, setPartnerId] = useState("");
  const [partnerSquad, setPartnerSquad] = useState<PlayerChip[]>([]);
  const [offerIds, setOfferIds] = useState<string[]>([]);
  const [requestIds, setRequestIds] = useState<string[]>([]);
  const [cashM, setCashM] = useState(0);
  const [counterTradeId, setCounterTradeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/trades`), apiFetchInit);
    const text = await res.text();
    let payload: TradesData & { error?: string };
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Failed to load trades");
    }
    if (!res.ok) throw new Error(payload.error ?? "Failed to load trades");
    return payload as TradesData;
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
      socket.on("trade:requested", () => {
        load().then(setData).catch(() => undefined);
        setToast("New trade offer received");
        setTimeout(() => setToast(null), 3000);
      });
      socket.on("trade:resolved", (payload: { status: string }) => {
        load().then(setData).catch(() => undefined);
        setToast(`Trade ${payload.status}`);
        setTimeout(() => setToast(null), 3000);
      });
      onBudgetUpdated(socket, () => load().then(setData).catch(() => undefined));
      return () => socket.disconnect();
    });
  }, [code, load]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerSquad([]);
      return;
    }
    fetch(apiPath(`/api/rooms/${code}/users/${partnerId}/squad`), apiFetchInit)
      .then((r) => r.json())
      .then((d) => setPartnerSquad(d.squad ?? []))
      .catch(() => setPartnerSquad([]));
  }, [partnerId, code]);

  function toggleId(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function submitTrade() {
    if (!partnerId) {
      setError("Pick a trade partner");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cashAdjustment = cashM * 1_000_000;
      if (counterTradeId) {
        const res = await fetch(apiPath(`/api/rooms/${code}/trades/${counterTradeId}`), {
          ...apiFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "counter",
            offeredPlayerIds: offerIds,
            requestedPlayerIds: requestIds,
            cashAdjustment,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error ?? "Counter failed");
        setToast("Counter-offer sent");
      } else {
        const res = await fetch(apiPath(`/api/rooms/${code}/trades`), {
          ...apiFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toUserId: partnerId,
            offeredPlayerIds: offerIds,
            requestedPlayerIds: requestIds,
            cashAdjustment,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error ?? "Failed to send trade");
        setToast("Trade offer sent");
      }
      setOfferIds([]);
      setRequestIds([]);
      setCashM(0);
      setCounterTradeId(null);
      setTab("inbox");
      await load().then(setData);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function act(tradeId: string, action: "accept" | "reject") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/trades/${tradeId}`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      await load().then(setData);
      setToast(`Trade ${action === "accept" ? "accepted" : "rejected"}`);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function startCounter(trade: TradeItem) {
    // Prefill swapped: you offer what they wanted, you request what they offered
    setPartnerId(trade.fromUserId);
    setOfferIds(trade.requestedPlayerIds ?? trade.requestedPlayers.map((p) => p.id));
    setRequestIds(trade.offeredPlayerIds ?? trade.offeredPlayers.map((p) => p.id));
    setCashM(Math.round(-trade.cashAdjustment / 1_000_000));
    setCounterTradeId(trade.id);
    setTab("create");
  }

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
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="font-display text-xl text-fc-gold"
        >
          Loading trades...
        </motion.p>
      </div>
    );
  }

  const { room, user, tradingAllowed, partners, mySquad, incoming, outgoing, history } = data;
  const inboxCount = incoming.length;

  return (
    <RoomLayoutShell
      code={room.code}
      roomName={room.name}
      phase={room.phase}
      teamName={user.teamName}
      budget={user.budget}
      isAdmin={user.isAdmin}
    >
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fc-gold px-6 py-3 text-sm font-semibold text-fc-navy shadow-glow">
          {toast}
        </div>
      )}

      <div className="space-y-6">
        <GlowCard glow="gold">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">Trade Center</h2>
              <p className="text-sm text-fc-muted mt-1">
                Swap players and cash with anyone in the room
              </p>
            </div>
            {!tradingAllowed && (
              <p className="text-sm text-red-300">Trading is closed in this phase</p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            {(
              [
                { id: "inbox", label: `Inbox${inboxCount ? ` (${inboxCount})` : ""}` },
                { id: "create", label: counterTradeId ? "Counter offer" : "New trade" },
                { id: "history", label: "History" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id !== "create") setCounterTradeId(null);
                  setTab(t.id);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                  tab === t.id
                    ? "bg-fc-gold text-fc-navy"
                    : "bg-fc-charcoal text-fc-muted hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </GlowCard>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}

        {tab === "inbox" && (
          <div className="space-y-4">
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold text-fc-gold">Incoming</h3>
              {incoming.length === 0 ? (
                <p className="text-sm text-fc-muted">No pending offers for you.</p>
              ) : (
                incoming.map((t) => (
                  <TradeCard
                    key={t.id}
                    trade={t}
                    meId={user.id}
                    busy={busy}
                    onAccept={() => act(t.id, "accept")}
                    onReject={() => act(t.id, "reject")}
                    onCounter={() => startCounter(t)}
                  />
                ))
              )}
            </section>
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">Outgoing</h3>
              {outgoing.length === 0 ? (
                <p className="text-sm text-fc-muted">No outgoing offers.</p>
              ) : (
                outgoing.map((t) => (
                  <TradeCard
                    key={t.id}
                    trade={t}
                    meId={user.id}
                    busy={busy}
                    onReject={() => act(t.id, "reject")}
                  />
                ))
              )}
            </section>
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-4">
            {!tradingAllowed ? (
              <GlowCard>
                <p className="text-fc-muted">Trading is not available right now.</p>
              </GlowCard>
            ) : (
              <>
                {counterTradeId && (
                  <p className="text-sm text-fc-accent">
                    Building a counter-offer — send to flip the previous deal.
                  </p>
                )}

                <GlowCard>
                  <label className="text-xs font-semibold uppercase text-fc-muted">
                    Trade with
                  </label>
                  <select
                    className="fc-input mt-1.5"
                    value={partnerId}
                    disabled={Boolean(counterTradeId)}
                    onChange={(e) => {
                      setPartnerId(e.target.value);
                      setRequestIds([]);
                    }}
                  >
                    <option value="">Select a team...</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.teamName} ({p.displayName})
                      </option>
                    ))}
                  </select>
                </GlowCard>

                <div className="grid gap-4 lg:grid-cols-2">
                  <GlowCard>
                    <h3 className="font-display font-semibold mb-3">Your players to offer</h3>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {mySquad.length === 0 ? (
                        <p className="text-sm text-fc-muted">Empty squad</p>
                      ) : (
                        mySquad.map((p) => (
                          <PlayerToggle
                            key={p.id}
                            player={p}
                            selected={offerIds.includes(p.id)}
                            onToggle={() => toggleId(offerIds, p.id, setOfferIds)}
                          />
                        ))
                      )}
                    </div>
                  </GlowCard>

                  <GlowCard>
                    <h3 className="font-display font-semibold mb-3">Their players you want</h3>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {!partnerId ? (
                        <p className="text-sm text-fc-muted">Pick a partner first</p>
                      ) : partnerSquad.length === 0 ? (
                        <p className="text-sm text-fc-muted">They have no players</p>
                      ) : (
                        partnerSquad.map((p) => (
                          <PlayerToggle
                            key={p.id}
                            player={p}
                            selected={requestIds.includes(p.id)}
                            onToggle={() => toggleId(requestIds, p.id, setRequestIds)}
                          />
                        ))
                      )}
                    </div>
                  </GlowCard>
                </div>

                <GlowCard>
                  <label className="text-xs font-semibold uppercase text-fc-muted">
                    Cash adjustment (millions)
                  </label>
                  <p className="text-xs text-fc-muted mt-1 mb-2">
                    Positive = you pay them · Negative = they pay you
                  </p>
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      type="number"
                      className="fc-input font-mono"
                      value={cashM}
                      onChange={(e) => setCashM(Number(e.target.value))}
                    />
                    <span className="text-fc-green font-bold">M</span>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !partnerId}
                    onClick={submitTrade}
                    className="fc-btn-primary mt-4"
                  >
                    {busy
                      ? "Sending..."
                      : counterTradeId
                        ? "Send counter-offer"
                        : "Send trade offer"}
                  </button>
                </GlowCard>
              </>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-fc-muted">No completed trades yet.</p>
            ) : (
              history.map((t) => <TradeCard key={t.id} trade={t} meId={user.id} />)
            )}
          </div>
        )}
      </div>
    </RoomLayoutShell>
  );
}
