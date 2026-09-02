"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

interface DeadlineBannerProps {
  transferWindowEndsAt: string | null;
  marketDeadlineAt?: string | null;
  deadlineStartsAt?: string | null;
  deadlineDayEnabled?: boolean;
  marketLocked?: boolean;
  rebidRoundEnabled?: boolean;
}

export function DeadlineBanner({
  transferWindowEndsAt,
  marketDeadlineAt,
  deadlineStartsAt,
  deadlineDayEnabled,
  marketLocked,
  rebidRoundEnabled,
}: DeadlineBannerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (rebidRoundEnabled) {
    return (
      <div className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-center">
        <p className="font-display text-lg font-bold text-amber-200">Rebid Round Active</p>
        <p className="text-sm text-fc-muted">
          Un-bid players only · 2-minute auctions · +30s if bid in the last minute
        </p>
      </div>
    );
  }

  if (marketLocked || (transferWindowEndsAt && new Date(transferWindowEndsAt).getTime() <= now)) {
    return (
      <div className="rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-center">
        <p className="font-display text-lg font-bold text-red-300">Market Closed</p>
        <p className="text-sm text-fc-muted">Transfer window has ended</p>
      </div>
    );
  }

  const deadlineIso = marketDeadlineAt ?? transferWindowEndsAt;
  if (!deadlineIso) return null;

  const end = new Date(deadlineIso).getTime();
  const remaining = end - now;
  const finalFive = remaining > 0 && remaining <= 5 * 60_000;
  const inDeadline =
    deadlineDayEnabled &&
    deadlineStartsAt &&
    now >= new Date(deadlineStartsAt).getTime() &&
    remaining > 0;

  return (
    <motion.div
      animate={finalFive ? { scale: [1, 1.01, 1] } : {}}
      transition={finalFive ? { repeat: Infinity, duration: 0.9 } : {}}
      className={`rounded-xl border px-4 py-3 ${
        finalFive
          ? "border-red-400/50 bg-red-500/20 shadow-[0_0_30px_rgba(248,113,113,0.25)]"
          : inDeadline
            ? "border-fc-gold/40 bg-fc-gold/10"
            : "border-white/10 bg-fc-card/80"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fc-muted">
            {finalFive
              ? "⚠ Final 5 minutes"
              : inDeadline
                ? "Deadline Day — faster timers"
                : "Market closes at 9:45 PM — time remaining"}
          </p>
          <p
            className={`font-mono text-3xl font-bold tabular-nums ${
              finalFive ? "text-red-300" : "text-fc-gold"
            }`}
          >
            {formatRemaining(remaining)}
          </p>
        </div>
        {inDeadline && !finalFive && (
          <p className="text-sm text-fc-gold font-semibold">Short bid timers active</p>
        )}
      </div>
    </motion.div>
  );
}
