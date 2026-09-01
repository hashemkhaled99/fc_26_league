"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DEFAULT_STARTING_BID } from "@/lib/auction/constants";
import { formatMoney } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  marketValue: number;
}

interface PlayerCardProps {
  player: Player;
  onRequestBid: (playerId: string) => void;
  loading?: boolean;
  index?: number;
}

const POSITION_COLORS: Record<string, string> = {
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

export function PlayerCard({ player, onRequestBid, loading, index = 0 }: PlayerCardProps) {
  const reduced = useReducedMotion();
  const gradient = POSITION_COLORS[player.position] ?? "from-fc-card to-fc-charcoal";

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : Math.min(index * 0.04, 0.4), type: "spring", stiffness: 300, damping: 28 }}
      whileHover={reduced ? undefined : { y: -4, transition: { duration: 0.2 } }}
      className="fc-card fc-shine fc-card-hover overflow-hidden group"
    >
      <div className={`relative h-24 bg-gradient-to-br ${gradient} p-3`}>
        <div className="absolute top-2 left-2 font-display text-2xl font-bold text-white drop-shadow-lg">
          {player.baseRating}
        </div>
        <div className="absolute top-2 right-2 text-xs font-bold text-white/90 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm">
          {player.position}
        </div>
        <div className="absolute bottom-2 left-3 right-3">
          <p className="font-display font-bold text-white truncate drop-shadow">{player.name}</p>
          <p className="text-xs text-white/75 truncate">{player.realTeam}</p>
        </div>
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <span className="text-fc-green font-mono text-sm font-semibold">
          {formatMoney(DEFAULT_STARTING_BID)}
        </span>
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={() => onRequestBid(player.id)}
          disabled={loading}
          className="rounded-lg bg-fc-gold/20 text-fc-gold text-xs font-bold px-3 py-1.5
            hover:bg-fc-gold hover:text-fc-navy transition-colors disabled:opacity-50"
        >
          Request Bid
        </motion.button>
      </div>
    </motion.div>
  );
}
