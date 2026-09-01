"use client";

import { motion, useReducedMotion } from "framer-motion";

export function LoadingPulse({ label = "Loading..." }: { label?: string }) {
  const reduced = useReducedMotion();

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <motion.div
        animate={reduced ? {} : { opacity: [0.45, 1, 0.45] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        className="flex flex-col items-center gap-4"
      >
        <div className="h-10 w-10 rounded-full border-2 border-fc-gold/30 border-t-fc-gold animate-spin-slow" />
        <p className="font-display text-xl text-fc-gold tracking-wide">{label}</p>
      </motion.div>
    </div>
  );
}
