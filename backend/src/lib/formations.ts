export type FormationId =
  | "433"
  | "433_hold"
  | "433_false9"
  | "442"
  | "442_hold"
  | "4411"
  | "4231"
  | "4231_wide"
  | "4141"
  | "4321"
  | "4312"
  | "41212"
  | "4222"
  | "4132"
  | "451"
  | "451_att"
  | "352"
  | "343"
  | "3421"
  | "3412"
  | "3142"
  | "3511"
  | "532"
  | "523"
  | "5212"
  | "541";

export interface FormationSlot {
  id: string;
  label: string;
  /** 0 = attack (top), higher = closer to GK */
  row: number;
  /** 0–100 horizontal percent */
  x: number;
}

export interface FormationDef {
  id: FormationId;
  name: string;
  group: "4-back" | "3-back" | "5-back";
  slots: FormationSlot[];
}

function slots(
  rows: Array<Array<{ id: string; label: string; x: number }>>
): FormationSlot[] {
  return rows.flatMap((row, rowIndex) =>
    row.map((s) => ({ ...s, row: rowIndex }))
  );
}

export const FORMATIONS: FormationDef[] = [
  // ——— 4 at the back ———
  {
    id: "433",
    name: "4-3-3",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lw", label: "LW", x: 18 },
        { id: "rw", label: "RW", x: 82 },
      ],
      [
        { id: "cm1", label: "CM", x: 28 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 72 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "433_hold",
    name: "4-3-3 Hold",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lw", label: "LW", x: 18 },
        { id: "rw", label: "RW", x: 82 },
      ],
      [
        { id: "cm1", label: "CM", x: 32 },
        { id: "cm2", label: "CM", x: 68 },
      ],
      [{ id: "cdm", label: "CDM", x: 50 }],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "433_false9",
    name: "4-3-3 False 9",
    group: "4-back",
    slots: slots([
      [{ id: "cf", label: "CF", x: 50 }],
      [
        { id: "lw", label: "LW", x: 18 },
        { id: "rw", label: "RW", x: 82 },
      ],
      [
        { id: "cm1", label: "CM", x: 28 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 72 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "442",
    name: "4-4-2",
    group: "4-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "442_hold",
    name: "4-4-2 Hold",
    group: "4-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "cdm1", label: "CDM", x: 38 },
        { id: "cdm2", label: "CDM", x: 62 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4411",
    name: "4-4-1-1",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [{ id: "cf", label: "CF", x: 50 }],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4231",
    name: "4-2-3-1",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lw", label: "LW", x: 18 },
        { id: "cam", label: "CAM", x: 50 },
        { id: "rw", label: "RW", x: 82 },
      ],
      [
        { id: "cdm1", label: "CDM", x: 35 },
        { id: "cdm2", label: "CDM", x: 65 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4231_wide",
    name: "4-2-3-1 Wide",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cam", label: "CAM", x: 50 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "cdm1", label: "CDM", x: 35 },
        { id: "cdm2", label: "CDM", x: 65 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4141",
    name: "4-1-4-1",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [{ id: "cdm", label: "CDM", x: 50 }],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4321",
    name: "4-3-2-1",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "cam1", label: "CAM", x: 35 },
        { id: "cam2", label: "CAM", x: 65 },
      ],
      [
        { id: "cm1", label: "CM", x: 28 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 72 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4312",
    name: "4-3-1-2",
    group: "4-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [{ id: "cam", label: "CAM", x: 50 }],
      [
        { id: "cm1", label: "CM", x: 28 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 72 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "41212",
    name: "4-1-2-1-2",
    group: "4-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [{ id: "cam", label: "CAM", x: 50 }],
      [
        { id: "cm1", label: "CM", x: 32 },
        { id: "cm2", label: "CM", x: 68 },
      ],
      [{ id: "cdm", label: "CDM", x: 50 }],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4222",
    name: "4-2-2-2",
    group: "4-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "cam1", label: "CAM", x: 28 },
        { id: "cam2", label: "CAM", x: 72 },
      ],
      [
        { id: "cdm1", label: "CDM", x: 35 },
        { id: "cdm2", label: "CDM", x: 65 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "4132",
    name: "4-1-3-2",
    group: "4-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "lm", label: "LM", x: 20 },
        { id: "cm", label: "CM", x: 50 },
        { id: "rm", label: "RM", x: 80 },
      ],
      [{ id: "cdm", label: "CDM", x: 50 }],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "451",
    name: "4-5-1",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lm", label: "LM", x: 10 },
        { id: "cm1", label: "CM", x: 30 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 70 },
        { id: "rm", label: "RM", x: 90 },
      ],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "451_att",
    name: "4-5-1 Attack",
    group: "4-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lw", label: "LW", x: 12 },
        { id: "cam1", label: "CAM", x: 35 },
        { id: "cam2", label: "CAM", x: 65 },
        { id: "rw", label: "RW", x: 88 },
      ],
      [{ id: "cdm", label: "CDM", x: 50 }],
      [
        { id: "lb", label: "LB", x: 12 },
        { id: "cb1", label: "CB", x: 36 },
        { id: "cb2", label: "CB", x: 64 },
        { id: "rb", label: "RB", x: 88 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },

  // ——— 3 at the back ———
  {
    id: "352",
    name: "3-5-2",
    group: "3-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "lm", label: "LM", x: 10 },
        { id: "cm1", label: "CM", x: 32 },
        { id: "cam", label: "CAM", x: 50 },
        { id: "cm2", label: "CM", x: 68 },
        { id: "rm", label: "RM", x: 90 },
      ],
      [
        { id: "cb1", label: "CB", x: 25 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 75 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "343",
    name: "3-4-3",
    group: "3-back",
    slots: slots([
      [
        { id: "lw", label: "LW", x: 20 },
        { id: "st", label: "ST", x: 50 },
        { id: "rw", label: "RW", x: 80 },
      ],
      [
        { id: "lm", label: "LM", x: 15 },
        { id: "cm1", label: "CM", x: 40 },
        { id: "cm2", label: "CM", x: 60 },
        { id: "rm", label: "RM", x: 85 },
      ],
      [
        { id: "cb1", label: "CB", x: 25 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 75 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "3421",
    name: "3-4-2-1",
    group: "3-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "cam1", label: "CAM", x: 35 },
        { id: "cam2", label: "CAM", x: 65 },
      ],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "cb1", label: "CB", x: 25 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 75 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "3412",
    name: "3-4-1-2",
    group: "3-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [{ id: "cam", label: "CAM", x: 50 }],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "cb1", label: "CB", x: 25 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 75 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "3142",
    name: "3-1-4-2",
    group: "3-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [{ id: "cdm", label: "CDM", x: 50 }],
      [
        { id: "cb1", label: "CB", x: 25 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 75 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "3511",
    name: "3-5-1-1",
    group: "3-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [{ id: "cf", label: "CF", x: 50 }],
      [
        { id: "lm", label: "LM", x: 10 },
        { id: "cm1", label: "CM", x: 32 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 68 },
        { id: "rm", label: "RM", x: 90 },
      ],
      [
        { id: "cb1", label: "CB", x: 25 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 75 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },

  // ——— 5 at the back ———
  {
    id: "532",
    name: "5-3-2",
    group: "5-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [
        { id: "cm1", label: "CM", x: 28 },
        { id: "cm2", label: "CM", x: 50 },
        { id: "cm3", label: "CM", x: 72 },
      ],
      [
        { id: "lwb", label: "LWB", x: 8 },
        { id: "cb1", label: "CB", x: 30 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 70 },
        { id: "rwb", label: "RWB", x: 92 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "523",
    name: "5-2-3",
    group: "5-back",
    slots: slots([
      [
        { id: "lw", label: "LW", x: 20 },
        { id: "st", label: "ST", x: 50 },
        { id: "rw", label: "RW", x: 80 },
      ],
      [
        { id: "cm1", label: "CM", x: 35 },
        { id: "cm2", label: "CM", x: 65 },
      ],
      [
        { id: "lwb", label: "LWB", x: 8 },
        { id: "cb1", label: "CB", x: 30 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 70 },
        { id: "rwb", label: "RWB", x: 92 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "5212",
    name: "5-2-1-2",
    group: "5-back",
    slots: slots([
      [
        { id: "st1", label: "ST", x: 35 },
        { id: "st2", label: "ST", x: 65 },
      ],
      [{ id: "cam", label: "CAM", x: 50 }],
      [
        { id: "cdm1", label: "CDM", x: 35 },
        { id: "cdm2", label: "CDM", x: 65 },
      ],
      [
        { id: "lwb", label: "LWB", x: 8 },
        { id: "cb1", label: "CB", x: 30 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 70 },
        { id: "rwb", label: "RWB", x: 92 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
  {
    id: "541",
    name: "5-4-1",
    group: "5-back",
    slots: slots([
      [{ id: "st", label: "ST", x: 50 }],
      [
        { id: "lm", label: "LM", x: 12 },
        { id: "cm1", label: "CM", x: 38 },
        { id: "cm2", label: "CM", x: 62 },
        { id: "rm", label: "RM", x: 88 },
      ],
      [
        { id: "lwb", label: "LWB", x: 8 },
        { id: "cb1", label: "CB", x: 30 },
        { id: "cb2", label: "CB", x: 50 },
        { id: "cb3", label: "CB", x: 70 },
        { id: "rwb", label: "RWB", x: 92 },
      ],
      [{ id: "gk", label: "GK", x: 50 }],
    ]),
  },
];

export function getFormation(id: FormationId): FormationDef {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];
}

export function positionFit(playerPos: string, slotLabel: string): number {
  const p = playerPos.toUpperCase();
  const s = slotLabel.toUpperCase();
  if (p === s) return 100;

  // Wings are fully interchangeable
  if ((p === "LW" && s === "LM") || (p === "LM" && s === "LW")) return 95;
  if ((p === "RW" && s === "RM") || (p === "RM" && s === "RW")) return 95;

  if (s === "CF" && (p === "ST" || p === "CAM")) return 80;

  const aliases: Record<string, string[]> = {
    ST: ["CF", "ST"],
    CF: ["ST", "CAM", "CF"],
    LW: ["LM", "LW", "LM"],
    RW: ["RM", "RW", "RM"],
    LM: ["LW", "LM", "LW"],
    RM: ["RW", "RM", "RW"],
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
  return 10; // still allow any drop; used only for auto-fill preference
}
