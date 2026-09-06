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
        label: "All-time",
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

export function qualityFromRating(rating: number) {
  if (rating >= 90) return "perfect";
  if (rating >= 80) return "good";
  if (rating >= 70) return "med";
  if (rating >= 60) return "bad";
  return "really_bad";
}

export function qualityLabel(quality: string): string {
  switch (quality) {
    case "perfect":
      return "Perfect";
    case "good":
      return "Good";
    case "med":
      return "Med";
    case "bad":
      return "Bad";
    case "really_bad":
      return "Really bad";
    default:
      return "Med";
  }
}

/** Split "Lionel Messi 2009" into name + year for all-time cards. */
export function parseAllTimePlayer(name: string, realTeam?: string) {
  const match = name.trim().match(/^(.*?)\s+(19\d{2}|20\d{2})$/);
  if (!match) {
    return { displayName: name, year: null as number | null, club: realTeam ?? "" };
  }
  return {
    displayName: match[1],
    year: Number(match[2]),
    club: realTeam ?? "",
  };
}

/** Hero Draft 18-slot labels (Starting XI 4-3-3 + bench buckets). */
export const DRAFT_SLOT_LABELS = [
  "GK",
  "RB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RW",
  "ST",
  "LW",
  "Bench CB",
  "Bench FB",
  "Bench MID",
  "Bench MID",
  "Bench ATK",
  "Bench LW",
  "Bench RW",
] as const;

