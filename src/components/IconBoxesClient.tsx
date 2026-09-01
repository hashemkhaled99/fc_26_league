"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AnimatedToast } from "@/components/AnimatedToast";
import { MAX_OPENABLE_BOXES } from "@/lib/icons/constants";
import { fadeUp, staggerContainer } from "@/lib/motion";

interface PlayerBrief {
  id: string;
  name: string;
  position: string;
  baseRating: number;
  realTeam: string;
}

interface Box {
  id: string;
  boxNumber: number;
  status: string;
  revealedOptionA: boolean;
  revealedOptionB: boolean;
  optionA: PlayerBrief | null;
  optionB: PlayerBrief | null;
  chosen: PlayerBrief | null;
}

interface SquadRow {
  id: string;
  isStarting: boolean;
  player: PlayerBrief & { boostedRating?: number | null };
}

interface Data {
  room: { code: string; name: string; phase: string; season: number };
  user: { id: string; teamName: string; budget: number; isAdmin: boolean };
  allowOverflow: boolean;
  boxes: Box[];
  squad: SquadRow[];
}

export function IconBoxesClient({
  code,
  kind = "icon",
}: {
  code: string;
  kind?: "icon" | "hero";
}) {
  const api = kind === "hero" ? "hero-boxes" : "icon-boxes";
  const title = kind === "hero" ? "Hero Boxes" : "Icon Boxes";
  const emptyHint =
    kind === "hero" ? "Generate Hero Boxes" : "Generate Icon Boxes";
  const playerLabel = kind === "hero" ? "hero" : "icon";

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [replaceBox, setReplaceBox] = useState<Box | null>(null);
  const [gambleSource, setGambleSource] = useState<Box | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}/${api}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load");
    return json as Data;
  }, [code, api]);

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (!data || replaceBox) return;
    const waiting = data.boxes.find((b) => b.status === "awaiting_replacement");
    if (waiting) setReplaceBox(waiting);
  }, [data, replaceBox]);

  async function act(
    boxId: string,
    action: "open" | "keep" | "gamble" | "replace",
    opts?: { gambleTargetBoxId?: string; releaseSquadPlayerId?: string }
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${code}/${api}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boxId,
          action,
          gambleTargetBoxId: opts?.gambleTargetBoxId,
          releaseSquadPlayerId: opts?.releaseSquadPlayerId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const next = await load();
      setData(next);
      setReplaceBox(null);
      setGambleSource(null);
      if (action === "gamble") setToast("Option B locked in — no going back!");
      else if (action === "keep") setToast(`${playerLabel} claimed!`);
      else if (action === "replace") setToast("Squad updated");
      setTimeout(() => setToast(null), 3000);
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
        Loading {kind} boxes...
      </div>
    );
  }

  const claimed = data.boxes.filter(
    (b) => b.status === "completed" || b.status === "awaiting_replacement"
  ).length;
  const resolved = data.boxes.filter((b) =>
    ["completed", "awaiting_replacement", "abandoned"].includes(b.status)
  ).length;
  const hasPendingDecision = data.boxes.some((b) => b.status === "option_a_revealed");
  const canOpenMore = resolved < MAX_OPENABLE_BOXES && !hasPendingDecision;
  const sealedBoxes = data.boxes.filter((b) => b.status === "pending");

  return (
    <RoomLayoutShell
      code={data.room.code}
      roomName={data.room.name}
      phase={data.room.phase}
      teamName={data.user.teamName}
      budget={data.user.budget}
      isAdmin={data.user.isAdmin}
    >
      <AnimatedToast message={toast} />

      {gambleSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="fc-card w-full max-w-md p-6">
            <h3 className="font-display text-xl font-bold text-fc-gold">Pick a box to gamble on</h3>
            <p className="mt-2 text-sm text-fc-muted">
              You&apos;re passing on Option A in Box {gambleSource.boxNumber}. Choose a sealed box —
              its hidden Option B will be revealed and locked in forever.
            </p>
            <div className="mt-4 space-y-2">
              {sealedBoxes
                .filter((b) => b.id !== gambleSource.id)
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(gambleSource.id, "gamble", { gambleTargetBoxId: b.id })
                    }
                    className="flex w-full items-center justify-between rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-left hover:bg-red-500/20"
                  >
                    <span className="font-semibold">Box {b.boxNumber}</span>
                    <span className="text-xs text-red-200">Reveal Option B</span>
                  </button>
                ))}
            </div>
            <button
              type="button"
              className="fc-btn-secondary mt-4 w-full"
              onClick={() => setGambleSource(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {replaceBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="fc-card w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="font-display text-xl font-bold text-fc-gold">Squad full — pick who to release</h3>
            <p className="mt-2 text-sm text-fc-muted">
              Your {playerLabel} {replaceBox.chosen?.name ?? "player"} needs a slot. Released players go to free
              agents (not sellable).
            </p>
            <div className="mt-4 space-y-2">
              {data.squad.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => act(replaceBox.id, "replace", { releaseSquadPlayerId: s.id })}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-fc-charcoal/60 px-3 py-2 text-left hover:border-red-400/40"
                >
                  <span className="font-semibold">
                    {s.player.name}{" "}
                    <span className="text-fc-muted text-xs">
                      {s.player.position} · {s.player.boostedRating ?? s.player.baseRating}
                    </span>
                  </span>
                  <span className="text-xs text-red-300">Release</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="fc-btn-secondary mt-4 w-full"
              onClick={() => setReplaceBox(null)}
            >
              Later
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <GlowCard glow="gold">
          <h1 className="font-display text-2xl font-bold text-fc-gold">{title}</h1>
          <p className="text-sm text-fc-muted mt-1">
            Season {data.room.season} · {claimed}/{MAX_OPENABLE_BOXES} claimed
          </p>
          <p className="text-xs text-fc-muted mt-2">
            Open up to {MAX_OPENABLE_BOXES} boxes. See Option A → keep it, or gamble by revealing
            Option B from a different sealed box (irreversible). Unused boxes lock automatically.
          </p>
        </GlowCard>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}

        {data.boxes.length === 0 ? (
          <GlowCard>
            <p className="text-fc-muted text-center py-8">
              No boxes yet. Admin must click <span className="text-fc-gold">{emptyHint}</span>.
            </p>
          </GlowCard>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid gap-4 sm:grid-cols-2"
          >
            {data.boxes.map((box, i) => (
              <motion.div key={box.id} variants={fadeUp} custom={i}>
              <IconBoxCard
                box={box}
                busy={busy}
                canOpenMore={canOpenMore}
                onOpen={() => act(box.id, "open")}
                onKeep={() => act(box.id, "keep")}
                onGamble={() => setGambleSource(box)}
                onReplace={() => setReplaceBox(box)}
              />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </RoomLayoutShell>
  );
}

function IconBoxCard({
  box,
  busy,
  canOpenMore,
  onOpen,
  onKeep,
  onGamble,
  onReplace,
}: {
  box: Box;
  busy: boolean;
  canOpenMore: boolean;
  onOpen: () => void;
  onKeep: () => void;
  onGamble: () => void;
  onReplace: () => void;
}) {
  const locked = box.status === "blocked";
  const abandoned = box.status === "abandoned";

  return (
    <GlowCard
      hover={false}
      className={
        box.status === "completed"
          ? "border-fc-green/30"
          : locked
            ? "opacity-50"
            : ""
      }
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-bold">Box {box.boxNumber}</h2>
        <span className="text-[10px] uppercase tracking-wide text-fc-muted">
          {box.status.replace(/_/g, " ")}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {box.status === "pending" && (
          <motion.div
            key="sealed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-8"
          >
            <motion.div
              whileHover={canOpenMore && !busy ? { scale: 1.06, rotate: [0, -2, 2, 0] } : {}}
              transition={{ duration: 0.35 }}
              className="h-28 w-20 rounded-xl bg-gradient-to-b from-fc-gold/50 to-fc-charcoal border border-fc-gold/60 shadow-glow flex items-center justify-center"
            >
              <span className="font-display text-3xl text-fc-gold drop-shadow-lg">?</span>
            </motion.div>
            <button
              type="button"
              disabled={busy || !canOpenMore}
              onClick={onOpen}
              className="fc-btn-primary mt-4 text-sm disabled:opacity-40"
            >
              Open box
            </button>
            {!canOpenMore && (
              <p className="mt-2 text-xs text-fc-muted text-center">
                Finish your current box or you&apos;ve used all {MAX_OPENABLE_BOXES} opens
              </p>
            )}
          </motion.div>
        )}

        {locked && (
          <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center">
            <p className="text-sm text-fc-muted">Locked — you already opened {MAX_OPENABLE_BOXES} boxes</p>
          </motion.div>
        )}

        {abandoned && (
          <motion.div key="abandoned" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6">
            {box.optionA && <PlayerReveal player={box.optionA} label="Option A (passed)" />}
            <p className="mt-3 text-center text-sm text-fc-muted">You gambled on another box</p>
          </motion.div>
        )}

        {box.status === "option_a_revealed" && box.optionA && (
          <motion.div
            key="a"
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 120 }}
          >
            <PlayerReveal player={box.optionA} label="Option A" />
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" disabled={busy} onClick={onKeep} className="fc-btn-primary text-sm">
                Keep this player
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onGamble}
                className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 hover:bg-red-500/20"
              >
                Gamble — reveal Option B from another box
              </button>
            </div>
          </motion.div>
        )}

        {(box.status === "completed" || box.status === "awaiting_replacement") && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {box.chosen || box.optionB || box.optionA ? (
              <PlayerReveal
                player={(box.chosen ?? box.optionB ?? box.optionA)!}
                label={box.revealedOptionB ? "Option B (locked)" : "Kept Option A"}
              />
            ) : null}
            {box.status === "awaiting_replacement" && (
              <button type="button" disabled={busy} onClick={onReplace} className="fc-btn-primary w-full mt-4 text-sm">
                Choose who to release
              </button>
            )}
            {box.status === "completed" && (
              <p className="mt-3 text-center text-sm text-fc-green font-semibold">✓ Added to squad</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlowCard>
  );
}

function PlayerReveal({ player, label }: { player: PlayerBrief; label: string }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className="rounded-xl border border-fc-gold/30 bg-gradient-to-br from-fc-gold/15 to-transparent p-4"
    >
      <p className="text-[10px] uppercase tracking-wide text-fc-gold mb-2">{label}</p>
      <div className="flex items-center gap-3">
        <div className="font-display text-4xl font-bold text-fc-gold">{player.baseRating}</div>
        <div>
          <p className="font-display text-lg font-bold">{player.name}</p>
          <p className="text-sm text-fc-muted">
            {player.position} · {player.realTeam}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
