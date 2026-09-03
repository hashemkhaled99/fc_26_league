"use client";

import { motion } from "framer-motion";
import { getTierVisual } from "@/lib/hero-draft-ui";
import { formatMoney } from "@/lib/utils";

export type DraftPlayer = {
  id: string;
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  marketValue: number;
  tier?: string;
};

export function TierPlayerCard({
  player,
  size = "md",
  highlight,
}: {
  player: DraftPlayer;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
}) {
  const tier = player.tier ?? "GOLD";
  const visual = getTierVisual(tier);
  const ratingSize =
    size === "lg" ? "text-5xl" : size === "sm" ? "text-xl" : "text-3xl";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, rotateY: -12 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${visual.bg} ${visual.border} ${
        highlight ? visual.glow : ""
      } ${size === "lg" ? "p-6" : size === "sm" ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${visual.badge}`}>
            {visual.label}
          </span>
          <p className={`mt-2 font-display font-bold text-white ${size === "lg" ? "text-2xl" : "text-lg"}`}>
            {player.name}
          </p>
          <p className="text-sm text-white/60">{player.realTeam}</p>
        </div>
        <div className="text-right">
          <p className={`font-display font-black text-white ${ratingSize}`}>{player.baseRating}</p>
          <p className="text-xs font-bold text-white/70">{player.position}</p>
        </div>
      </div>
      <p className="mt-3 font-mono text-sm text-fc-green">{formatMoney(player.marketValue)}</p>
    </motion.div>
  );
}
