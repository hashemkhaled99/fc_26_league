"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { PlayerCard } from "@/components/PlayerCard";
import { AuctionCard } from "@/components/AuctionCard";
import {
  MarketFilters,
  applyMarketFilters,
  RATING_MIN,
  RATING_MAX,
  type MarketFiltersState,
} from "@/components/MarketFilters";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { DealTicker } from "@/components/DealTicker";
import { onBudgetUpdated } from "@/lib/room-socket";
import { getPublicSocketUrl } from "@/lib/public-env";
import { formatMoney } from "@/lib/utils";

interface MarketData {
  room: { code: string; name: string; phase: string };
  settings?: {
    bidTimerSeconds: number;
    deadlineBidTimerSeconds: number;
    deadlineDayEnabled: boolean;
    deadlineStartsAt: string | null;
    deadlineEndsAt: string | null;
    transferWindowEndsAt: string | null;
    marketLocked: boolean;
  };
  user: {
    id: string;
    displayName: string;
    teamName: string;
    budget: number;
    availableBudget: number;
    committedBudget: number;
    squadCount: number;
    squadLimit: number;
    isAdmin: boolean;
  };
  filterOptions?: {
    leagues: string[];
    teams: string[];
  };
  availablePlayers: Array<{
    id: string;
    name: string;
    realTeam: string;
    league?: string | null;
    position: string;
    baseRating: number;
    marketValue: number;
  }>;
  activeAuctions: Array<{
    id: string;
    playerId: string;
    player: {
      id: string;
      name: string;
      realTeam: string;
      position: string;
      baseRating: number;
    };
    startingPrice: number;
    currentBid: number;
    currentBidderId: string | null;
    currentBidder: { id: string; displayName: string; teamName: string } | null;
    endsAt: string;
    isResale: boolean;
    sellerId?: string | null;
    myHighestBid?: number | null;
    myBidStatus?: "winning" | "outbid" | null;
  }>;
}

const DEFAULT_FILTERS: MarketFiltersState = {
  search: "",
  position: "ALL",
  team: "",
  league: "",
  minRating: RATING_MIN,
  maxRating: RATING_MAX,
};

export default function MarketPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [liveDeal, setLiveDeal] = useState<string | null>(null);
  const [filters, setFilters] = useState<MarketFiltersState>(DEFAULT_FILTERS);
  const [loadingBid, setLoadingBid] = useState(false);
  const [connected, setConnected] = useState(false);

  const loadMarket = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/market`), apiFetchInit);
    const text = await res.text();
    let payload: MarketData & { error?: string };
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Market API returned invalid data. Try refreshing.");
    }
    if (!res.ok) {
      throw new Error(payload.error ?? "Failed to load market");
    }
    return payload as MarketData;
  }, [code]);

  useEffect(() => {
    loadMarket()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [loadMarket]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    import("socket.io-client").then(({ io }) => {
      const socket = io(socketUrl, { transports: ["websocket", "polling"] });
      socket.on("connect", () => {
        setConnected(true);
        socket.emit("room:join", { roomCode: code });
      });
      socket.on("disconnect", () => setConnected(false));

      socket.on("auction:started", () => loadMarket().then(setData));
      socket.on("bid:placed", (bid: { playerName: string; amount: number; bidder?: { teamName: string } }) => {
        loadMarket().then(setData);
        if (bid.bidder) {
          setToast(`🔥 ${bid.bidder.teamName} bid ${formatMoney(bid.amount)} on ${bid.playerName}`);
          setTimeout(() => setToast(null), 4000);
        }
      });
      socket.on("auction:closed", (result: {
        status: string;
        playerName: string;
        winnerTeam?: string;
        finalBid: number;
        isResale?: boolean;
      }) => {
        loadMarket().then(setData);
        if (result.status === "closed" && result.winnerTeam) {
          const line = `🔥 ${result.winnerTeam} signed ${result.playerName} for ${formatMoney(result.finalBid)}`;
          setToast(`✅ ${result.winnerTeam} signed ${result.playerName} for ${formatMoney(result.finalBid)}`);
          setLiveDeal(line);
        } else {
          setToast(`Auction ended — no winner for ${result.playerName}`);
        }
        setTimeout(() => setToast(null), 5000);
      });
      socket.on("settings:updated", () => loadMarket().then(setData));
      onBudgetUpdated(socket, () => loadMarket().then(setData));
      socket.on("market:locked", () => {
        loadMarket().then(setData);
        setToast("Market has been locked");
        setTimeout(() => setToast(null), 4000);
      });
      socket.on("phase:changed", () => loadMarket().then(setData));

      return () => socket.disconnect();
    });
  }, [code, loadMarket]);

  const teams = useMemo(() => {
    if (!data) return [];
    if (data.filterOptions?.teams?.length) return data.filterOptions.teams;
    return Array.from(new Set(data.availablePlayers.map((p) => p.realTeam).filter(Boolean))).sort();
  }, [data]);

  const leagues = useMemo(() => {
    if (!data) return [];
    if (data.filterOptions?.leagues?.length) return data.filterOptions.leagues;
    return Array.from(
      new Set(
        data.availablePlayers
          .map((p) => p.league)
          .filter((l): l is string => Boolean(l))
      )
    ).sort();
  }, [data]);

  const filteredPlayers = useMemo(() => {
    if (!data) return [];
    return applyMarketFilters(data.availablePlayers, filters);
  }, [data, filters]);

  const myBiddings = useMemo(() => {
    if (!data) return [];
    return data.activeAuctions.filter((a) => a.myBidStatus);
  }, [data]);

  const otherAuctions = useMemo(() => {
    if (!data) return [];
    return data.activeAuctions.filter((a) => !a.myBidStatus);
  }, [data]);

  async function handleRequestBid(playerId: string) {
    setLoadingBid(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/auctions/start`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to start auction");
      await loadMarket().then(setData);
      setToast(`Auction started!`);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingBid(false);
    }
  }

  async function handleBid(auctionId: string, amount: number) {
    setError("");
    try {
      const res = await fetch(apiPath("/api/auctions/bid"), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId, amount }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Bid failed");
        await loadMarket().then(setData);
        return;
      }
      await loadMarket().then(setData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bid failed");
    }
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
          Loading market...
        </motion.p>
      </div>
    );
  }

  const { room, user, activeAuctions } = data;
  const marketLocked = Boolean(data.settings?.marketLocked);

  if (room.phase !== "bidding") {
    return (
      <RoomLayoutShell
        code={room.code}
        roomName={room.name}
        phase={room.phase}
        teamName={user.teamName}
        budget={user.budget}
        isAdmin={user.isAdmin}
      >
        <GlowCard>
          <p className="text-fc-muted">
            Market is closed. Phase: <span className="text-fc-gold">{room.phase}</span>
          </p>
          {user.isAdmin && room.phase === "lobby" && (
            <p className="mt-2 text-sm">
              Go to Lobby or Admin to start the bidding phase.
            </p>
          )}
        </GlowCard>
      </RoomLayoutShell>
    );
  }

  return (
    <RoomLayoutShell
      code={room.code}
      roomName={room.name}
      phase={room.phase}
      teamName={user.teamName}
      budget={user.availableBudget}
      isAdmin={user.isAdmin}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-fc-gold text-fc-navy px-6 py-3 font-semibold shadow-glow max-w-lg text-center text-sm"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <DeadlineBanner
          transferWindowEndsAt={data.settings?.transferWindowEndsAt ?? null}
          deadlineStartsAt={data.settings?.deadlineStartsAt}
          deadlineDayEnabled={data.settings?.deadlineDayEnabled}
          marketLocked={data.settings?.marketLocked}
        />

        <DealTicker roomCode={room.code} liveLine={liveDeal} />

        <GlowCard glow="green">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-fc-muted">Available to spend</p>
              <p className="font-mono text-2xl font-bold text-fc-green">
                {formatMoney(user.availableBudget)}
              </p>
              {user.committedBudget > 0 && (
                <p className="text-xs text-fc-muted mt-1">
                  {formatMoney(user.committedBudget)} committed in active bids
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-fc-muted">Squad slots</p>
              <p className="font-display text-2xl font-bold">
                <span className="text-fc-gold">{user.squadCount}</span>
                <span className="text-fc-muted">/{user.squadLimit}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-fc-green animate-pulse" : "bg-red-500"}`}
              />
              <span className="text-sm text-fc-muted">{connected ? "Live" : "..."}</span>
            </div>
          </div>
        </GlowCard>

        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}

        {myBiddings.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold text-fc-accent mb-4">
              My Biddings ({myBiddings.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myBiddings.map((auction, i) => (
                <div key={auction.id} className="space-y-2">
                  {auction.myHighestBid != null && auction.myBidStatus === "outbid" && (
                    <p className="text-xs text-fc-muted px-1">
                      Your bid: {formatMoney(auction.myHighestBid)} · Current:{" "}
                      {formatMoney(auction.currentBid)}
                    </p>
                  )}
                  <div className="relative">
                    <span
                      className={`absolute top-3 left-3 z-10 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        auction.myBidStatus === "winning"
                          ? "bg-fc-green/20 text-fc-green border border-fc-green/40"
                          : "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                      }`}
                    >
                      {auction.myBidStatus === "winning" ? "Winning" : "Outbid"}
                    </span>
                    <AuctionCard
                      index={i}
                      auction={auction}
                      currentUserId={user.id}
                      onBid={handleBid}
                      locked={marketLocked}
                      onExpire={() => loadMarket().then(setData)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {otherAuctions.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold text-fc-gold mb-4">
              🔥 Live Auctions ({otherAuctions.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherAuctions.map((auction, i) => (
                <AuctionCard
                  key={auction.id}
                  index={i}
                  auction={auction}
                  currentUserId={user.id}
                  onBid={handleBid}
                  locked={marketLocked}
                  onExpire={() => loadMarket().then(setData)}
                />
              ))}
            </div>
          </section>
        )}

        {activeAuctions.length === 0 && (
          <GlowCard>
            <p className="text-fc-muted text-center py-4">
              No live auctions right now — start one from the player list below.
            </p>
          </GlowCard>
        )}

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">Available Players</h2>

          {marketLocked ? (
            <p className="text-fc-muted text-center py-6">
              Transfer window closed — new auctions are disabled.
            </p>
          ) : (
            <>
              <MarketFilters
                filters={filters}
                onChange={setFilters}
                teams={teams}
                leagues={leagues}
                resultCount={filteredPlayers.length}
              />

              {filteredPlayers.length === 0 ? (
                <p className="text-fc-muted text-center py-8">
                  No players match these filters. Try clearing search or filters.
                </p>
              ) : (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredPlayers.map((player, i) => (
                    <PlayerCard
                      key={player.id}
                      index={i}
                      player={player}
                      onRequestBid={handleRequestBid}
                      loading={loadingBid}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </RoomLayoutShell>
  );
}
