"use client";

import { motion } from "framer-motion";
import { formatMoney } from "@/lib/utils";
import {
  formatBoostedStats,
  parseBoostedStats,
  type BoostedStat,
} from "@/lib/players/faceStats";

export interface SquadEntry {
  id: string;
  loanId?: string | null;
  isStarting: boolean;
  purchasePrice: number;
  isLoanedIn?: boolean;
  isLoanedOut?: boolean;
  loanFixturesRemaining?: number | null;
  player: {
    id: string;
    name: string;
    realTeam: string;
    position: string;
    baseRating: number;
    boostedRating?: number | null;
    boostedStats?: BoostedStat[] | unknown | null;
    league?: string | null;
    isIcon?: boolean;
    isHero?: boolean;
  };
}

interface SquadPlayerCardProps {
  entry: SquadEntry;
  onToggleStarter: (id: string, isStarting: boolean) => void;
  onResale: (entry: SquadEntry) => void;
  busy?: boolean;
  canResale?: boolean;
}

const POS_COLORS: Record<string, string> = {
  GK: "from-yellow-600 to-yellow-800",
  CB: "from-green-700 to-green-900",
  LB: "from-green-600 to-green-800",
  RB: "from-green-600 to-green-800",
  CDM: "from-emerald-600 to-emerald-800",
  CM: "from-emerald-500 to-emerald-700",
  CAM: "from-teal-500 to-teal-700",
  LM: "from-blue-600 to-blue-800",
  RM: "from-blue-600 to-blue-800",
  LW: "from-blue-500 to-blue-700",
  RW: "from-blue-500 to-blue-700",
  ST: "from-red-600 to-red-800",
};

export function BoostStatChips({
  stats,
  compact,
}: {
  stats: BoostedStat[];
  compact?: boolean;
}) {
  if (stats.length === 0) return null;
  return (
    <div className={`flex flex-wrap ${compact ? "gap-0.5" : "gap-1"}`}>
      {stats.map((s) => (
        <span
          key={s.key}
          title={`${s.label} +${s.bump}`}
          className={`font-mono font-bold uppercase tracking-wide rounded bg-fc-accent/90 text-fc-navy ${
            compact ? "text-[8px] px-1 py-px" : "text-[9px] px-1.5 py-0.5"
          }`}
        >
          {s.label}+{s.bump}
        </span>
      ))}
    </div>
  );
}

export function SquadPlayerCard({
  entry,
  onToggleStarter,
  onResale,
  busy,
  canResale = true,
}: SquadPlayerCardProps) {
  const { player } = entry;
  const rating = player.boostedRating ?? player.baseRating;
  const gradient = POS_COLORS[player.position] ?? "from-fc-card to-fc-charcoal";
  const isBoosted =
    player.boostedRating != null && player.boostedRating > player.baseRating;
  const boostStats = parseBoostedStats(player.boostedStats);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className={`fc-card fc-card-hover fc-shine overflow-hidden ${entry.isStarting ? "border-fc-green/40 shadow-glow-green" : ""}`}
    >
      <div className={`relative h-20 bg-gradient-to-br ${gradient} p-2`}>
        <div className="absolute top-1.5 left-2 font-display text-xl font-bold text-white drop-shadow">
          {rating}
        </div>
        {isBoosted && (
          <div className="absolute top-1.5 left-12 text-[9px] font-bold uppercase bg-fc-accent/90 text-fc-navy px-1.5 py-0.5 rounded">
            +{player.boostedRating! - player.baseRating} boost
          </div>
        )}
        {player.isIcon && (
          <div className="absolute bottom-1.5 right-2 text-[9px] font-bold uppercase bg-fc-gold text-fc-navy px-1.5 py-0.5 rounded">
            Icon
          </div>
        )}
        {player.isHero && (
          <div className="absolute bottom-1.5 right-2 text-[9px] font-bold uppercase bg-fc-accent text-fc-navy px-1.5 py-0.5 rounded">
            Hero
          </div>
        )}
        {entry.isLoanedIn && (
          <div className="absolute bottom-1.5 left-2 text-[9px] font-bold uppercase bg-sky-500/90 text-white px-1.5 py-0.5 rounded">
            On loan
          </div>
        )}
        {entry.isLoanedOut && (
          <div className="absolute bottom-1.5 left-2 text-[9px] font-bold uppercase bg-orange-500/90 text-white px-1.5 py-0.5 rounded">
            Loaned out
          </div>
        )}
        <div className="absolute top-1.5 right-2 text-[10px] font-bold text-white/80 bg-black/30 px-1.5 py-0.5 rounded">
          {player.position}
        </div>
        <div className="absolute bottom-1.5 left-2 right-2">
          <p className="font-display font-bold text-white text-sm truncate">{player.name}</p>
          <p className="text-[10px] text-white/70 truncate">{player.realTeam}</p>
        </div>
      </div>

      <div className="p-2 space-y-1.5">
        {isBoosted && boostStats.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase tracking-wide text-fc-accent/80">Boosted stats</p>
            <BoostStatChips stats={boostStats} />
          </div>
        )}
        {isBoosted && boostStats.length === 0 && (
          <p className="text-[9px] text-fc-accent/80">
            Overall +{player.boostedRating! - player.baseRating}
          </p>
        )}
        <p className="text-[10px] text-fc-muted">
          {entry.isLoanedIn ? (
            <>
              Loan ·{" "}
              <span className="text-fc-accent font-mono">
                {entry.loanFixturesRemaining ?? "?"} fixtures left
              </span>
            </>
          ) : (
            <>
              Paid <span className="text-fc-green font-mono">{formatMoney(entry.purchasePrice)}</span>
            </>
          )}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy || entry.isLoanedOut}
            onClick={() => onToggleStarter(entry.id, !entry.isStarting)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
              entry.isStarting
                ? "bg-fc-green/20 text-fc-green hover:bg-fc-green/30"
                : "bg-fc-gold/20 text-fc-gold hover:bg-fc-gold hover:text-fc-navy"
            }`}
          >
            {entry.isStarting ? "→ Bench" : "→ Start"}
          </button>
          {canResale && !entry.isLoanedIn && !entry.isLoanedOut && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onResale(entry)}
              className="rounded-md px-2 py-1.5 text-[10px] font-bold bg-white/5 text-fc-muted hover:text-white hover:bg-white/10 disabled:opacity-50"
            >
              Sell
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export { formatBoostedStats, parseBoostedStats };
