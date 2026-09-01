"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatDurationSeconds } from "@/lib/format-duration";

interface CountdownProps {
  endsAt: string;
  onExpire?: () => void;
  urgentThreshold?: number;
}

export function Countdown({ endsAt, onExpire, urgentThreshold = 10 }: CountdownProps) {
  const reduced = useReducedMotion();
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    function tick() {
      const left = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && onExpire) onExpire();
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  const urgent = secondsLeft <= urgentThreshold && secondsLeft > 0;
  const critical = secondsLeft <= 300 && secondsLeft > 0;

  return (
    <div className="relative flex items-center justify-center">
      {urgent && !reduced && (
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-red-400/60"
          animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      )}
      <motion.span
        key={secondsLeft}
        initial={reduced ? false : { scale: urgent ? 1.2 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className={`relative font-mono text-lg font-bold tabular-nums px-2 py-0.5 rounded ${
          urgent
            ? "text-red-400 bg-red-500/10"
            : critical
              ? "text-orange-300"
              : secondsLeft === 0
                ? "text-fc-muted"
                : "text-fc-gold"
        }`}
      >
        {formatDurationSeconds(secondsLeft)}
      </motion.span>
    </div>
  );
}
