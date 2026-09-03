export type TierVisual = {
  label: string;
  border: string;
  glow: string;
  badge: string;
  bg: string;
};

export function getTierVisual(tier: string): TierVisual {
  switch (tier) {
    case "ICON":
      return {
        label: "Icon",
        border: "border-violet-400/60",
        glow: "shadow-[0_0_28px_rgba(167,139,250,0.45)]",
        badge: "bg-violet-500/30 text-violet-200",
        bg: "from-violet-900/80 via-indigo-950 to-fc-charcoal",
      };
    case "HERO":
      return {
        label: "Hero",
        border: "border-amber-400/50",
        glow: "shadow-[0_0_22px_rgba(251,191,36,0.35)]",
        badge: "bg-amber-500/25 text-amber-200",
        bg: "from-amber-900/70 via-orange-950/80 to-fc-charcoal",
      };
    default:
      return {
        label: "Gold",
        border: "border-fc-gold/40",
        glow: "shadow-[0_0_16px_rgba(245,197,24,0.2)]",
        badge: "bg-fc-gold/20 text-fc-gold",
        bg: "from-yellow-900/50 via-fc-charcoal to-fc-navy",
      };
  }
}
