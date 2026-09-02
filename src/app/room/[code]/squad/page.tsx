"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { FormationBoard, reconcileSlotMap } from "@/components/FormationBoard";
import type { SquadEntry } from "@/components/SquadPlayerCard";
import { ResaleModal } from "@/components/ResaleModal";
import { formatMoney } from "@/lib/utils";
import type { FormationId } from "@/lib/formations";
import { onBudgetUpdated } from "@/lib/room-socket";

interface SquadData {
  room: { code: string; name: string; phase: string };
  user: {
    id: string;
    displayName: string;
    teamName: string;
    budget: number;
    isAdmin: boolean;
  };
  starters: SquadEntry[];
  bench: SquadEntry[];
  counts: {
    total: number;
    starters: number;
    maxStarters: number;
    squadLimit: number;
  };
}

function slotStorageKey(code: string, formationId: string) {
  return `fc26-slots-${code}-${formationId}`;
}

function loadSavedSlots(code: string, formationId: string): Record<string, string | null> | null {
  try {
    const raw = localStorage.getItem(slotStorageKey(code, formationId));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, string | null>;
  } catch {
    return null;
  }
}

function saveSlots(code: string, formationId: string, map: Record<string, string | null>) {
  try {
    localStorage.setItem(slotStorageKey(code, formationId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export default function SquadPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [data, setData] = useState<SquadData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resaleTarget, setResaleTarget] = useState<SquadEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [boostBanner, setBoostBanner] = useState<
    Array<{ name: string; from: number; to: number; statsLabel: string; position: string }> | null
  >(null);
  const [formationId, setFormationId] = useState<FormationId>("433");
  const [slotMap, setSlotMap] = useState<Record<string, string | null>>({});

  const userIdRef = useRef<string | null>(null);
  const formationRef = useRef(formationId);
  const loadGen = useRef(0);
  const busyRef = useRef(false);

  formationRef.current = formationId;
  busyRef.current = busy;

  const applySquad = useCallback(
    (squad: SquadData, opts?: { refillEmpty?: boolean; preferSlots?: Record<string, string | null> }) => {
      setData(squad);
      userIdRef.current = squad.user.id;
      setSlotMap((prev) => {
        const base = opts?.preferSlots ?? prev;
        const saved = loadSavedSlots(code, formationRef.current);
        const merged = { ...(saved ?? {}), ...base };
        const next = reconcileSlotMap(formationRef.current, squad.starters, merged, {
          refillEmpty: opts?.refillEmpty ?? false,
        });
        saveSlots(code, formationRef.current, next);
        return next;
      });
    },
    [code]
  );

  const loadSquad = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}/squad`);
    const text = await res.text();
    let payload: SquadData & { error?: string };
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Failed to load squad");
    }
    if (!res.ok) throw new Error(payload.error ?? "Failed to load squad");
    return payload as SquadData;
  }, [code]);

  useEffect(() => {
    const saved = localStorage.getItem(`fc26-formation-${code}`) as FormationId | null;
    if (saved) setFormationId(saved);
  }, [code]);

  useEffect(() => {
    const gen = ++loadGen.current;
    loadSquad()
      .then((squad) => {
        if (gen !== loadGen.current) return;
        applySquad(squad, { refillEmpty: true });
      })
      .catch((e) => setError(e.message));
  }, [loadSquad, applySquad]);

  // Stable socket — do not reconnect when data/formation changes
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";
    let socket: { disconnect: () => void } | null = null;

    import("socket.io-client").then(({ io }) => {
      const s = io(socketUrl, { transports: ["websocket", "polling"] });
      socket = s;
      s.on("connect", () => s.emit("room:join", { roomCode: code }));

      const refresh = () => {
        if (busyRef.current) return; // don't fight local drag/edit
        const gen = ++loadGen.current;
        loadSquad()
          .then((squad) => {
            if (gen !== loadGen.current) return;
            applySquad(squad, { refillEmpty: false });
          })
          .catch(() => undefined);
      };

      s.on("squad:updated", (payload: { userId?: string }) => {
        if (payload.userId && userIdRef.current && payload.userId !== userIdRef.current) {
          return;
        }
        refresh();
      });
      s.on("auction:closed", refresh);
      onBudgetUpdated(s, () => {
        loadSquad()
          .then((squad) => applySquad(squad, { refillEmpty: false }))
          .catch(() => undefined);
      });
      s.on(
        "boost:applied",
        (payload: {
          boosts?: Array<{
            userId: string;
            boosted: Array<{
              name: string;
              position: string;
              from: number;
              to: number;
              statsLabel?: string;
              stats?: Array<{ label: string; bump: number }>;
            }>;
          }>;
        }) => {
          const mine = payload.boosts?.find((b) => b.userId === userIdRef.current);
          if (mine && mine.boosted.length > 0) {
            setBoostBanner(
              mine.boosted.map((p) => ({
                name: p.name,
                position: p.position,
                from: p.from,
                to: p.to,
                statsLabel:
                  p.statsLabel ||
                  (p.stats ?? []).map((s) => `${s.label} +${s.bump}`).join(" · "),
              }))
            );
            setToast(
              `${mine.boosted.length} player${mine.boosted.length === 1 ? "" : "s"} boosted — check which stats went up`
            );
            setTimeout(() => setToast(null), 4500);
          }
          refresh();
        }
      );
    });

    return () => socket?.disconnect();
  }, [code, loadSquad, applySquad]);

  function changeFormation(id: FormationId) {
    setFormationId(id);
    localStorage.setItem(`fc26-formation-${code}`, id);
    if (!data) return;
    const saved = loadSavedSlots(code, id);
    const next = reconcileSlotMap(id, data.starters, saved ?? undefined, {
      refillEmpty: true,
    });
    setSlotMap(next);
    saveSlots(code, id, next);
  }

  function updateSlotMap(next: Record<string, string | null>) {
    setSlotMap(next);
    saveSlots(code, formationId, next);
  }

  /** Optimistic local move between starters/bench without waiting for server */
  function optimisticMove(squadPlayerId: string, isStarting: boolean) {
    setData((prev) => {
      if (!prev) return prev;
      const all = [...prev.starters, ...prev.bench];
      const entry = all.find((e) => e.id === squadPlayerId);
      if (!entry) return prev;
      const updated = { ...entry, isStarting };
      const others = all.filter((e) => e.id !== squadPlayerId);
      const starters = isStarting
        ? [...others.filter((e) => e.isStarting), updated]
        : others.filter((e) => e.isStarting);
      const bench = !isStarting
        ? [...others.filter((e) => !e.isStarting), updated]
        : others.filter((e) => !e.isStarting);
      return {
        ...prev,
        starters,
        bench,
        counts: {
          ...prev.counts,
          starters: starters.length,
          total: starters.length + bench.length,
        },
      };
    });
  }

  async function toggleStarter(squadPlayerId: string, isStarting: boolean) {
    setBusy(true);
    setError("");
    optimisticMove(squadPlayerId, isStarting);
    try {
      const res = await fetch(`/api/rooms/${code}/squad/toggle-starter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squadPlayerId, isStarting }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Could not update");
      // Soft sync — keep current slot map
      const gen = ++loadGen.current;
      const squad = await loadSquad();
      if (gen !== loadGen.current) return;
      applySquad(squad, { refillEmpty: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      // rollback from server truth
      const squad = await loadSquad().catch(() => null);
      if (squad) applySquad(squad, { refillEmpty: false });
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function confirmResale(squadPlayerId: string, startingPrice: number) {
    const res = await fetch(`/api/rooms/${code}/squad/resale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squadPlayerId, startingPrice }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Resale failed");
    const squad = await loadSquad();
    applySquad(squad, { refillEmpty: false });
    setToast(`Listed for ${formatMoney(startingPrice)} on the market`);
    setTimeout(() => setToast(null), 3500);
  }

  async function confirmInstantSell(squadPlayerId: string) {
    const res = await fetch(`/api/rooms/${code}/squad/instant-sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squadPlayerId }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Instant sell failed");
    const squad = await loadSquad();
    applySquad(squad, { refillEmpty: false });
    setToast(
      result.message ??
        `Instant sold for ${formatMoney(result.refund ?? 0)} (50% refund)`
    );
    setTimeout(() => setToast(null), 3500);
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
          Loading squad...
        </motion.p>
      </div>
    );
  }

  const { room, user, starters, bench, counts } = data;
  const canResale = room.phase === "bidding";

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

      {boostBanner && boostBanner.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-xl border border-fc-accent/40 bg-fc-charcoal/95 p-4 shadow-glow backdrop-blur-md">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-sm font-bold text-fc-accent">Bot boost applied</p>
              <p className="text-[11px] text-fc-muted">
                Outfield: PAC SHO PAS DRI DEF PHY · GK: DIV HAN KIC REF SPD POS
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-fc-muted hover:text-white"
              onClick={() => setBoostBanner(null)}
            >
              Dismiss
            </button>
          </div>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {boostBanner.map((p) => (
              <li
                key={`${p.name}-${p.from}-${p.to}`}
                className="rounded-lg bg-white/5 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {p.name}{" "}
                    <span className="text-[10px] font-bold text-fc-muted">{p.position}</span>
                  </p>
                  <p className="shrink-0 font-mono text-xs text-fc-gold">
                    {p.from}→{p.to}
                  </p>
                </div>
                {p.statsLabel && (
                  <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-wide text-fc-accent">
                    {p.statsLabel}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resaleTarget && (
        <ResaleModal
          entry={resaleTarget}
          onClose={() => setResaleTarget(null)}
          onConfirm={confirmResale}
          onInstantSell={confirmInstantSell}
        />
      )}

      <div className="space-y-6">
        <GlowCard glow="green">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">Your Squad</h2>
              <p className="text-sm text-fc-muted mt-1">
                Pick a formation · drag players onto slots · tap a card for Bench / Sell
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-xs text-fc-muted">Starters</p>
                <p className="font-display text-xl font-bold">
                  <span className="text-fc-green">{counts.starters}</span>
                  <span className="text-fc-muted">/{counts.maxStarters}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-fc-muted">Squad</p>
                <p className="font-display text-xl font-bold">
                  <span className="text-fc-gold">{counts.total}</span>
                  <span className="text-fc-muted">/{counts.squadLimit}</span>
                </p>
              </div>
            </div>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </GlowCard>

        {counts.total === 0 ? (
          <GlowCard>
            <p className="text-center text-fc-muted py-8">
              No players yet — win some auctions on the{" "}
              <a href={`/room/${room.code}/market`} className="text-fc-gold hover:underline">
                Market
              </a>
              .
            </p>
          </GlowCard>
        ) : (
          <FormationBoard
            starters={starters}
            bench={bench}
            formationId={formationId}
            onFormationChange={changeFormation}
            slotMap={slotMap}
            onSlotMapChange={updateSlotMap}
            busy={busy}
            canResale={canResale}
            onPlaceStarter={(id) => toggleStarter(id, true)}
            onBench={(id) => toggleStarter(id, false)}
            onSell={setResaleTarget}
          />
        )}
      </div>
    </RoomLayoutShell>
  );
}
