"use client";

import { motion } from "framer-motion";
import { RoomNav } from "@/components/RoomNav";

interface RoomLayoutShellProps {
  code: string;
  roomName: string;
  phase: string;
  teamName?: string;
  budget?: number;
  isAdmin?: boolean;
  children: React.ReactNode;
}

const PHASE_LABELS: Record<string, string> = {
  lobby: "Lobby",
  bidding: "Transfer Market",
  hero_draft: "Hero Draft",
  trade_window: "Trade Window",
  draft_recap: "Draft Recap",
  league: "League",
  season_end: "Season End",
};

export function RoomLayoutShell({
  code,
  roomName,
  phase,
  teamName,
  budget,
  isAdmin,
  children,
}: RoomLayoutShellProps) {
  const phaseLabel = PHASE_LABELS[phase] ?? phase.replace("_", " ");

  return (
    <div className="min-h-screen">
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="sticky top-0 z-40 border-b border-white/10 bg-fc-charcoal/85 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-wide text-fc-gold">
              {roomName}
            </h1>
            <p className="text-xs text-fc-muted flex items-center gap-2 flex-wrap">
              <span>
                Code: <span className="text-fc-accent font-mono font-semibold">{code}</span>
              </span>
              <span className="text-white/20">·</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-fc-gold/20 bg-fc-gold/5 px-2 py-0.5 text-fc-gold capitalize">
                {phaseLabel}
              </span>
            </p>
          </div>
          {teamName && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="text-right"
            >
              <p className="font-display font-semibold">{teamName}</p>
              {budget !== undefined && (
                <p className="text-sm text-fc-green font-mono font-bold">
                  {(budget / 1000000).toFixed(0)}M
                  <span className="text-fc-muted font-normal ml-1">budget</span>
                </p>
              )}
            </motion.div>
          )}
        </div>
      </motion.header>
      <RoomNav code={code} phase={phase} isAdmin={isAdmin} />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mx-auto max-w-6xl px-4 py-6"
      >
        {children}
      </motion.main>
    </div>
  );
}
