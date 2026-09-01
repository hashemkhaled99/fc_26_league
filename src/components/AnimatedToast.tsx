"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface AnimatedToastProps {
  message: string | null;
  variant?: "gold" | "green" | "danger";
}

const VARIANTS = {
  gold: "bg-fc-gold text-fc-navy shadow-glow",
  green: "bg-fc-green text-fc-navy shadow-glow-green",
  danger: "bg-red-500 text-white",
};

export function AnimatedToast({ message, variant = "gold" }: AnimatedToastProps) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          initial={reduced ? false : { opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? undefined : { opacity: 0, y: -12, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl px-6 py-3 text-sm font-bold ${VARIANTS[variant]}`}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
