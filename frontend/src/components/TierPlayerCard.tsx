"use client";

import { motion } from "framer-motion";
import { getTierVisual, parseAllTimePlayer } from "@/lib/hero-draft-ui";

export type DraftPlayer = {
  id: string;
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
  marketValue?: number;
  tier?: string;
  league?: string | null;
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
  const { displayName, year, club } = parseAllTimePlayer(player.name, player.realTeam);
  const subtitle = year ? [String(year), club].filter(Boolean).join(" · ") : club;

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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${visual.badge}`}>
              {visual.label}
            </span>
            {year != null && (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-bold tabular-nums bg-white/10 text-white/90">
                {year}
              </span>
            )}
          </div>
          <p className={`mt-2 font-display font-bold text-white ${size === "lg" ? "text-2xl" : "text-lg"}`}>
            {displayName}
          </p>
          <p className="text-sm text-white/60">{subtitle}</p>
        </div>
        <p className="text-xs font-bold text-white/70">{player.position}</p>
      </div>
    </motion.div>
  );
}
