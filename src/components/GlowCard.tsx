"use client";

import { motion, useReducedMotion } from "framer-motion";
import { springSnappy } from "@/lib/motion";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "gold" | "green" | "accent" | "none";
  delay?: number;
  hover?: boolean;
}

export function GlowCard({
  children,
  className = "",
  glow = "none",
  delay = 0,
  hover = true,
}: GlowCardProps) {
  const reduced = useReducedMotion();

  const glowClass =
    glow === "gold"
      ? "shadow-glow border-fc-gold/30"
      : glow === "green"
        ? "shadow-glow-green border-fc-green/30"
        : glow === "accent"
          ? "shadow-glow-accent border-fc-accent/30"
          : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSnappy, delay: reduced ? 0 : delay }}
      whileHover={reduced || !hover ? undefined : { y: -2, transition: { duration: 0.2 } }}
      className={`fc-card p-6 ${hover ? "fc-card-hover" : ""} ${glowClass} ${className}`}
    >
      {children}
    </motion.div>
  );
}
