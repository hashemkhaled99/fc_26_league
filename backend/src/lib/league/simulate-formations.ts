/**
 * Compact formation shapes for match sim (mirrors frontend formation labels).
 * Bias: positive atk = more attacking shape; positive def = more solid.
 */

export type SimFormationId =
  | "433"
  | "433_hold"
  | "442"
  | "4231"
  | "4141"
  | "352"
  | "343"
  | "532"
  | "541"
  | "451";

export type SimFormationDef = {
  id: SimFormationId;
  name: string;
  /** Slot labels in rough pitch order (attack → GK). Must be 11. */
  slots: string[];
  atkBias: number;
  defBias: number;
};

export const SIM_FORMATIONS: SimFormationDef[] = [
  {
    id: "433",
    name: "4-3-3",
    slots: ["ST", "LW", "RW", "CM", "CM", "CM", "LB", "CB", "CB", "RB", "GK"],
    atkBias: 0.04,
    defBias: 0,
  },
  {
    id: "433_hold",
    name: "4-3-3 Hold",
    slots: ["ST", "LW", "RW", "CM", "CM", "CDM", "LB", "CB", "CB", "RB", "GK"],
    atkBias: 0.02,
    defBias: 0.04,
  },
  {
    id: "442",
    name: "4-4-2",
    slots: ["ST", "ST", "LM", "CM", "CM", "RM", "LB", "CB", "CB", "RB", "GK"],
    atkBias: 0.03,
    defBias: 0.02,
  },
  {
    id: "4231",
    name: "4-2-3-1",
    slots: ["ST", "LW", "CAM", "RW", "CDM", "CDM", "LB", "CB", "CB", "RB", "GK"],
    atkBias: 0.05,
    defBias: 0.02,
  },
  {
    id: "4141",
    name: "4-1-4-1",
    slots: ["ST", "LM", "CM", "CM", "RM", "CDM", "LB", "CB", "CB", "RB", "GK"],
    atkBias: 0,
    defBias: 0.05,
  },
  {
    id: "352",
    name: "3-5-2",
    slots: ["ST", "ST", "LM", "CM", "CDM", "CM", "RM", "CB", "CB", "CB", "GK"],
    atkBias: 0.06,
    defBias: -0.02,
  },
  {
    id: "343",
    name: "3-4-3",
    slots: ["ST", "LW", "RW", "LM", "CM", "CM", "RM", "CB", "CB", "CB", "GK"],
    atkBias: 0.08,
    defBias: -0.04,
  },
  {
    id: "532",
    name: "5-3-2",
    slots: ["ST", "ST", "CM", "CM", "CM", "LWB", "CB", "CB", "CB", "RWB", "GK"],
    atkBias: -0.04,
    defBias: 0.1,
  },
  {
    id: "541",
    name: "5-4-1",
    slots: ["ST", "LM", "CM", "CM", "RM", "LWB", "CB", "CB", "CB", "RWB", "GK"],
    atkBias: -0.06,
    defBias: 0.12,
  },
  {
    id: "451",
    name: "4-5-1",
    slots: ["ST", "LM", "CM", "CDM", "CM", "RM", "LB", "CB", "CB", "RB", "GK"],
    atkBias: -0.02,
    defBias: 0.06,
  },
];

export function getSimFormation(id: string): SimFormationDef {
  return SIM_FORMATIONS.find((f) => f.id === id) ?? SIM_FORMATIONS[0];
}

/** 0–100 how well a player position fits a formation slot. */
export function positionFit(playerPos: string, slotLabel: string): number {
  const p = playerPos.toUpperCase();
  const s = slotLabel.toUpperCase();
  if (p === s) return 100;

  if ((p === "LW" && s === "LM") || (p === "LM" && s === "LW")) return 95;
  if ((p === "RW" && s === "RM") || (p === "RM" && s === "RW")) return 95;
  if (s === "CF" && (p === "ST" || p === "CAM")) return 80;

  const aliases: Record<string, string[]> = {
    ST: ["CF", "ST"],
    CF: ["ST", "CAM", "CF"],
    LW: ["LM", "LW"],
    RW: ["RM", "RW"],
    LM: ["LW", "LM", "LWB"],
    RM: ["RW", "RM", "RWB"],
    LWB: ["LB", "LWB", "LM", "LW"],
    RWB: ["RB", "RWB", "RM", "RW"],
    CAM: ["CM", "CAM", "CF"],
    CDM: ["CM", "CDM"],
    CM: ["CDM", "CAM", "CM"],
    CB: ["CB"],
    LB: ["LWB", "LB", "LM"],
    RB: ["RWB", "RB", "RM"],
    GK: ["GK"],
  };
  const related = aliases[s] ?? [s];
  if (related.includes(p)) return 70;
  return 25;
}

export type LineRole = "gk" | "def" | "mid" | "att";

export function slotRole(slotLabel: string): LineRole {
  const s = slotLabel.toUpperCase();
  if (s === "GK") return "gk";
  if (["CB", "LB", "RB", "LWB", "RWB"].includes(s)) return "def";
  if (["ST", "CF", "LW", "RW"].includes(s)) return "att";
  return "mid";
}
