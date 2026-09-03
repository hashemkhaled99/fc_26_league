/**
 * Hero Draft slot template.
 * Starting XI: standard 4-3-3. Bench: fixed role buckets (flexible positions).
 */

export type DraftSlotDef = {
  /** Display / formation label */
  label: string;
  /** Positions eligible for this slot (exact match against Player.position) */
  allowedPositions: string[];
  /** Whether this is a starting XI slot */
  isStarting: boolean;
};

export const DEFAULT_SLOT_TEMPLATE: DraftSlotDef[] = [
  // Starting XI (4-3-3)
  { label: "GK", allowedPositions: ["GK"], isStarting: true },
  { label: "RB", allowedPositions: ["RB"], isStarting: true },
  { label: "CB", allowedPositions: ["CB"], isStarting: true },
  { label: "CB", allowedPositions: ["CB"], isStarting: true },
  { label: "LB", allowedPositions: ["LB"], isStarting: true },
  { label: "CDM", allowedPositions: ["CDM"], isStarting: true },
  { label: "CM", allowedPositions: ["CM"], isStarting: true },
  { label: "CAM", allowedPositions: ["CAM"], isStarting: true },
  { label: "RW", allowedPositions: ["RW"], isStarting: true },
  { label: "ST", allowedPositions: ["ST"], isStarting: true },
  { label: "LW", allowedPositions: ["LW"], isStarting: true },
  // Bench (7)
  { label: "BENCH_CB", allowedPositions: ["CB"], isStarting: false },
  { label: "BENCH_FB", allowedPositions: ["RB", "LB"], isStarting: false },
  { label: "BENCH_MID_1", allowedPositions: ["CM", "CDM", "CAM"], isStarting: false },
  { label: "BENCH_MID_2", allowedPositions: ["CM", "CDM", "CAM"], isStarting: false },
  { label: "BENCH_ATK", allowedPositions: ["CAM", "ST"], isStarting: false },
  { label: "BENCH_LW", allowedPositions: ["LM", "LW"], isStarting: false },
  { label: "BENCH_RW", allowedPositions: ["RM", "RW"], isStarting: false },
];

export const TOTAL_DRAFT_SLOTS = DEFAULT_SLOT_TEMPLATE.length; // 18

export function getSlotByIndex(index: number, template: DraftSlotDef[] = DEFAULT_SLOT_TEMPLATE): DraftSlotDef {
  if (index < 0 || index >= template.length) {
    throw new Error(`Invalid slot index ${index}`);
  }
  return template[index];
}

/** Pick a random unfilled slot index from remaining. */
export function pickRandomUnfilledSlotIndex(
  filledSlotIndexes: number[],
  templateLength: number = TOTAL_DRAFT_SLOTS,
  rng: () => number = Math.random
): number {
  const filled = new Set(filledSlotIndexes);
  const remaining: number[] = [];
  for (let i = 0; i < templateLength; i++) {
    if (!filled.has(i)) remaining.push(i);
  }
  if (remaining.length === 0) {
    throw new Error("No unfilled slots remaining");
  }
  const idx = Math.floor(rng() * remaining.length);
  return remaining[idx];
}

export function playerMatchesSlot(playerPosition: string, slot: DraftSlotDef): boolean {
  return slot.allowedPositions.includes(playerPosition);
}
