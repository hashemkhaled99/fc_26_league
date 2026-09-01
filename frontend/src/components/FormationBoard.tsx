"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SquadEntry } from "./SquadPlayerCard";
import { BoostStatChips } from "./SquadPlayerCard";
import {
  FORMATIONS,
  getFormation,
  positionFit,
  type FormationId,
} from "@/lib/formations";
import { parseBoostedStats } from "@/lib/players/faceStats";

const DRAG_TYPE = "application/x-squad-player";

interface FormationBoardProps {
  starters: SquadEntry[];
  bench: SquadEntry[];
  formationId: FormationId;
  onFormationChange: (id: FormationId) => void;
  slotMap: Record<string, string | null>;
  onSlotMapChange: (next: Record<string, string | null>) => void;
  onPlaceStarter: (squadPlayerId: string) => Promise<void>;
  onBench: (squadPlayerId: string) => Promise<void>;
  onSell: (entry: SquadEntry) => void;
  canResale: boolean;
  busy?: boolean;
}

function isBoosted(entry: SquadEntry) {
  return (
    entry.player.boostedRating != null &&
    entry.player.boostedRating > entry.player.baseRating
  );
}

function useTouchDevice() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setTouch(mq.matches || navigator.maxTouchPoints > 0);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return touch;
}

function PitchCard({
  entry,
  selected,
  touchMode,
  onOpenMenu,
  onSelect,
}: {
  entry: SquadEntry;
  selected: boolean;
  touchMode: boolean;
  onOpenMenu: (entry: SquadEntry, x: number, y: number) => void;
  onSelect: (id: string) => void;
}) {
  const dragged = useRef(false);
  const rating = entry.player.boostedRating ?? entry.player.baseRating;
  const boosted = isBoosted(entry);

  return (
    <div
      draggable={!touchMode}
      onDragStart={(e) => {
        if (touchMode) return;
        dragged.current = false;
        e.dataTransfer.setData(DRAG_TYPE, entry.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDrag={() => {
        dragged.current = true;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (touchMode) {
          onSelect(entry.id);
          return;
        }
        if (dragged.current) return;
        onOpenMenu(entry, e.clientX, e.clientY);
      }}
      className={`w-[4.5rem] rounded-lg border px-1 py-1.5 text-center shadow-lg backdrop-blur-sm transition select-none touch-manipulation ${
        touchMode ? "cursor-pointer active:scale-95" : "cursor-grab active:cursor-grabbing hover:border-fc-gold hover:scale-105"
      } ${
        selected
          ? "border-fc-gold ring-2 ring-fc-gold/60 scale-105"
          : boosted
            ? "border-fc-accent/70 bg-fc-navy/95 ring-1 ring-fc-accent/40"
            : "border-white/25 bg-fc-navy/90"
      }`}
    >
      <div className="font-display text-base font-bold text-fc-gold leading-none">{rating}</div>
      <div className="mt-0.5 text-[9px] font-bold text-fc-green">{entry.player.position}</div>
      <div className="mt-0.5 truncate text-[9px] font-semibold text-white leading-tight">
        {entry.player.name}
      </div>
    </div>
  );
}

function BenchChip({
  entry,
  selected,
  touchMode,
  onOpenMenu,
  onSelect,
}: {
  entry: SquadEntry;
  selected: boolean;
  touchMode: boolean;
  onOpenMenu: (entry: SquadEntry, x: number, y: number) => void;
  onSelect: (id: string) => void;
}) {
  const dragged = useRef(false);
  const rating = entry.player.boostedRating ?? entry.player.baseRating;
  const boosted = isBoosted(entry);

  return (
    <div
      draggable={!touchMode}
      onDragStart={(e) => {
        if (touchMode) return;
        dragged.current = false;
        e.dataTransfer.setData(DRAG_TYPE, entry.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDrag={() => {
        dragged.current = true;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (touchMode) {
          onSelect(entry.id);
          return;
        }
        if (dragged.current) return;
        onOpenMenu(entry, e.clientX, e.clientY);
      }}
      className={`fc-card w-28 overflow-hidden select-none touch-manipulation ${
        touchMode ? "cursor-pointer active:scale-95" : "cursor-grab active:cursor-grabbing hover:border-fc-gold/40"
      } ${selected ? "border-fc-gold ring-2 ring-fc-gold/50" : boosted ? "border-fc-accent/50" : ""}`}
    >
      <div className="bg-fc-charcoal px-2 py-2">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold text-fc-gold">{rating}</span>
          <span className="text-[10px] font-bold text-fc-muted">{entry.player.position}</span>
        </div>
        <p className="truncate text-xs font-semibold mt-0.5">{entry.player.name}</p>
      </div>
    </div>
  );
}

export function FormationBoard({
  starters,
  bench,
  formationId,
  onFormationChange,
  slotMap,
  onSlotMapChange,
  onPlaceStarter,
  onBench,
  onSell,
  canResale,
  busy,
}: FormationBoardProps) {
  const formation = getFormation(formationId);
  const touchMode = useTouchDevice();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [dragOverBench, setDragOverBench] = useState(false);
  const [menu, setMenu] = useState<{
    entry: SquadEntry;
    x: number;
    y: number;
  } | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, SquadEntry>();
    [...starters, ...bench].forEach((e) => map.set(e.id, e));
    return map;
  }, [starters, bench]);

  const selectedEntry = selectedId ? byId.get(selectedId) : undefined;

  const cacheRef = useRef(new Map<string, SquadEntry>());
  useEffect(() => {
    byId.forEach((v, k) => cacheRef.current.set(k, v));
  }, [byId]);

  function resolveEntry(id: string | null | undefined): SquadEntry | undefined {
    if (!id) return undefined;
    return byId.get(id) ?? cacheRef.current.get(id);
  }

  const maxRow = Math.max(...formation.slots.map((s) => s.row));

  function toggleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setMenu(null);
  }

  async function placeInSlot(slotId: string, squadPlayerId: string) {
    const next = { ...slotMap };

    for (const key of Object.keys(next)) {
      if (next[key] === squadPlayerId) next[key] = null;
    }

    const existing = next[slotId];
    next[slotId] = squadPlayerId;

    onSlotMapChange(next);
    await onPlaceStarter(squadPlayerId);

    if (existing && existing !== squadPlayerId) {
      const empty = formation.slots.find((s) => !next[s.id]);
      if (empty) {
        next[empty.id] = existing;
        onSlotMapChange({ ...next });
      }
    }
  }

  async function handleDropOnSlot(slotId: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverSlot(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (!id || busy) return;
    await placeInSlot(slotId, id);
  }

  async function handleSlotTap(slotId: string) {
    if (!touchMode || !selectedId || busy) return;
    await placeInSlot(slotId, selectedId);
    setSelectedId(null);
  }

  async function handleDropOnBench(e: React.DragEvent) {
    e.preventDefault();
    setDragOverBench(false);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (!id || busy) return;

    const next = { ...slotMap };
    for (const key of Object.keys(next)) {
      if (next[key] === id) next[key] = null;
    }
    onSlotMapChange(next);
    await onBench(id);
  }

  async function handleBenchTap() {
    if (!touchMode || !selectedId || busy) return;
    const entry = byId.get(selectedId);
    if (!entry?.isStarting) return;

    const next = { ...slotMap };
    for (const key of Object.keys(next)) {
      if (next[key] === selectedId) next[key] = null;
    }
    onSlotMapChange(next);
    await onBench(selectedId);
    setSelectedId(null);
  }

  function openMenu(entry: SquadEntry, x: number, y: number) {
    setMenu({ entry, x, y });
  }

  return (
    <div className="space-y-4" onClick={() => { setMenu(null); if (touchMode) setSelectedId(null); }}>
      {touchMode && selectedEntry && (
        <div className="rounded-lg border border-fc-gold/40 bg-fc-gold/10 px-3 py-2 space-y-2">
          <p className="text-center text-sm text-fc-gold">
            <span className="font-semibold">{selectedEntry.player.name}</span> selected — tap an empty slot, or use actions below
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {selectedEntry.isStarting ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-fc-charcoal px-3 py-1.5 text-xs font-semibold"
                onClick={(e) => { e.stopPropagation(); void handleBenchTap(); }}
              >
                Bench
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-fc-charcoal px-3 py-1.5 text-xs font-semibold text-fc-gold"
                onClick={async (e) => {
                  e.stopPropagation();
                  const id = selectedEntry.id;
                  const empty = formation.slots
                    .filter((s) => !slotMap[s.id])
                    .sort(
                      (a, b) =>
                        positionFit(selectedEntry.player.position, b.label) -
                        positionFit(selectedEntry.player.position, a.label)
                    )[0];
                  setSelectedId(null);
                  if (!empty) {
                    await onPlaceStarter(id);
                    return;
                  }
                  await placeInSlot(empty.id, id);
                }}
              >
                Put in XI
              </button>
            )}
            {canResale && (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-fc-charcoal px-3 py-1.5 text-xs font-semibold text-red-300"
                onClick={(e) => {
                  e.stopPropagation();
                  const entry = selectedEntry;
                  setSelectedId(null);
                  onSell(entry);
                }}
              >
                Sell
              </button>
            )}
            <button
              type="button"
              className="rounded-lg bg-fc-charcoal px-3 py-1.5 text-xs text-fc-muted"
              onClick={(e) => { e.stopPropagation(); setSelectedId(null); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="fc-card space-y-3 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-fc-muted">
          Choose formation ({FORMATIONS.length})
        </p>
        {(
          [
            { key: "4-back", label: "4 at the back" },
            { key: "3-back", label: "3 at the back" },
            { key: "5-back", label: "5 at the back" },
          ] as const
        ).map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/40">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FORMATIONS.filter((f) => f.group === group.key).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFormationChange(f.id);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    formationId === f.id
                      ? "bg-fc-gold text-fc-navy"
                      : "bg-fc-charcoal text-fc-muted hover:text-white"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-fc-green/25 bg-gradient-to-b from-emerald-950 via-green-900 to-emerald-950 min-h-[420px] md:min-h-[520px]">
        <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/10" />
        <div className="pointer-events-none absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-white/10" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

        <div
          className="relative grid h-full gap-2 p-4 md:p-6"
          style={{ gridTemplateRows: `repeat(${maxRow + 1}, minmax(4.5rem, 1fr))` }}
        >
          {Array.from({ length: maxRow + 1 }, (_, row) => (
            <div key={row} className="relative">
              {formation.slots
                .filter((s) => s.row === row)
                .map((slot) => {
                  const playerId = slotMap[slot.id];
                  const entry = resolveEntry(playerId);
                  const isOver = dragOverSlot === slot.id;
                  const tapTarget = touchMode && selectedId && !entry;

                  return (
                    <div
                      key={slot.id}
                      onDragOver={(e) => {
                        if (touchMode) return;
                        e.preventDefault();
                        setDragOverSlot(slot.id);
                      }}
                      onDragLeave={() => setDragOverSlot(null)}
                      onDrop={(e) => handleDropOnSlot(slot.id, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tapTarget) void handleSlotTap(slot.id);
                      }}
                      className={`absolute -translate-x-1/2 top-1/2 -translate-y-1/2 ${
                        isOver || tapTarget ? "scale-110" : ""
                      }`}
                      style={{ left: `${slot.x}%` }}
                    >
                      {entry ? (
                        <PitchCard
                          entry={entry}
                          selected={selectedId === entry.id}
                          touchMode={touchMode}
                          onOpenMenu={openMenu}
                          onSelect={toggleSelect}
                        />
                      ) : (
                        <div
                          className={`flex h-[4.25rem] w-[4.5rem] flex-col items-center justify-center rounded-lg border border-dashed text-center touch-manipulation ${
                            tapTarget
                              ? "border-fc-gold bg-fc-gold/25 text-fc-gold animate-pulse"
                              : isOver
                                ? "border-fc-gold bg-fc-gold/20 text-fc-gold"
                                : "border-white/20 text-white/30"
                          }`}
                        >
                          <span className="text-[10px] font-bold">{slot.label}</span>
                          <span className="text-[9px]">{touchMode ? "Tap" : "Drop"}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          if (touchMode) return;
          e.preventDefault();
          setDragOverBench(true);
        }}
        onDragLeave={() => setDragOverBench(false)}
        onDrop={handleDropOnBench}
        onClick={(e) => {
          e.stopPropagation();
          if (touchMode && selectedId) void handleBenchTap();
        }}
        className={`rounded-xl border p-4 transition-colors touch-manipulation ${
          dragOverBench || (touchMode && selectedId && selectedEntry?.isStarting)
            ? "border-fc-gold bg-fc-gold/10"
            : "border-white/10 bg-fc-card/40"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">
            Bench ({bench.length})
          </h3>
          <p className="text-xs text-fc-muted text-right">
            {touchMode
              ? "Tap player · tap slot or bench"
              : "Drag onto pitch · tap card for options"}
          </p>
        </div>

        {bench.length === 0 ? (
          <p className="text-sm text-fc-muted py-4 text-center">
            {touchMode
              ? "Select a starter and tap here to bench them."
              : "Drop a starter here to bench them, or win more players from the market."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bench.map((entry) => (
              <BenchChip
                key={entry.id}
                entry={entry}
                selected={selectedId === entry.id}
                touchMode={touchMode}
                onOpenMenu={openMenu}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-[160px] max-w-[220px] overflow-hidden rounded-xl border border-white/15 bg-fc-charcoal shadow-glow"
          style={{
            left: Math.min(menu.x, window.innerWidth - 230),
            top: Math.min(menu.y, window.innerHeight - 200),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-white/10 px-3 py-2 space-y-1">
            <p className="truncate text-xs font-semibold">{menu.entry.player.name}</p>
            {isBoosted(menu.entry) && (
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-wide text-fc-accent">
                  Boosted +
                  {(menu.entry.player.boostedRating ?? 0) - menu.entry.player.baseRating} OVR
                </p>
                <BoostStatChips stats={parseBoostedStats(menu.entry.player.boostedStats)} />
              </div>
            )}
          </div>
          {menu.entry.isStarting && (
            <button
              type="button"
              disabled={busy}
              className="block w-full px-3 py-2.5 text-left text-sm hover:bg-white/5 disabled:opacity-50"
              onClick={async () => {
                const id = menu.entry.id;
                setMenu(null);
                const next = { ...slotMap };
                for (const key of Object.keys(next)) {
                  if (next[key] === id) next[key] = null;
                }
                onSlotMapChange(next);
                await onBench(id);
              }}
            >
              Bench
            </button>
          )}
          {!menu.entry.isStarting && (
            <button
              type="button"
              disabled={busy}
              className="block w-full px-3 py-2.5 text-left text-sm text-fc-gold hover:bg-white/5 disabled:opacity-50"
              onClick={async () => {
                const id = menu.entry.id;
                setMenu(null);
                const empty = formation.slots
                  .filter((s) => !slotMap[s.id])
                  .sort(
                    (a, b) =>
                      positionFit(menu.entry.player.position, b.label) -
                      positionFit(menu.entry.player.position, a.label)
                  )[0];
                if (!empty) {
                  await onPlaceStarter(id);
                  return;
                }
                await placeInSlot(empty.id, id);
              }}
            >
              Put in XI
            </button>
          )}
          {canResale && (
            <button
              type="button"
              disabled={busy}
              className="block w-full px-3 py-2.5 text-left text-sm text-red-300 hover:bg-white/5 disabled:opacity-50"
              onClick={() => {
                const entry = menu.entry;
                setMenu(null);
                onSell(entry);
              }}
            >
              Sell
            </button>
          )}
          <button
            type="button"
            className="block w-full border-t border-white/10 px-3 py-2 text-left text-xs text-fc-muted hover:bg-white/5"
            onClick={() => setMenu(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Stable slot reconcile — never reshuffles players already on the pitch.
 * Only clears invalid ids and fills empty slots with unassigned starters.
 */
export function reconcileSlotMap(
  formationId: FormationId,
  starters: SquadEntry[],
  previous?: Record<string, string | null>,
  options?: { refillEmpty?: boolean }
): Record<string, string | null> {
  const refillEmpty = options?.refillEmpty ?? true;
  const formation = getFormation(formationId);
  const starterIds = new Set(starters.map((s) => s.id));
  const next: Record<string, string | null> = {};
  const used = new Set<string>();

  for (const slot of formation.slots) {
    const prev = previous?.[slot.id] ?? null;
    if (prev && starterIds.has(prev) && !used.has(prev)) {
      next[slot.id] = prev;
      used.add(prev);
    } else {
      next[slot.id] = null;
    }
  }

  if (!refillEmpty) return next;

  const remaining = starters.filter((s) => !used.has(s.id));
  for (const entry of remaining) {
    const best = formation.slots
      .filter((s) => !next[s.id])
      .map((s) => ({
        slot: s,
        score: positionFit(entry.player.position, s.label),
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      next[best.slot.id] = entry.id;
      used.add(entry.id);
    }
  }

  return next;
}

/** @deprecated use reconcileSlotMap */
export function autoAssignSlots(
  formationId: FormationId,
  starters: SquadEntry[],
  previous?: Record<string, string | null>
): Record<string, string | null> {
  return reconcileSlotMap(formationId, starters, previous, { refillEmpty: true });
}
