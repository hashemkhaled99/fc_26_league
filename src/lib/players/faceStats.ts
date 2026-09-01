/** FC-style face stats shown when a player is bot-boosted. */

export type FaceStatKey =
  | "pac"
  | "sho"
  | "pas"
  | "dri"
  | "def"
  | "phy"
  | "div"
  | "han"
  | "kic"
  | "ref"
  | "spd"
  | "pos";

export interface BoostedStat {
  key: FaceStatKey;
  /** Short label for UI (PAC, DIV, …) */
  label: string;
  bump: number;
}

export const OUTFIELD_STATS: ReadonlyArray<{ key: FaceStatKey; label: string }> = [
  { key: "pac", label: "PAC" },
  { key: "sho", label: "SHO" },
  { key: "pas", label: "PAS" },
  { key: "dri", label: "DRI" },
  { key: "def", label: "DEF" },
  { key: "phy", label: "PHY" },
];

/** GK card face stats (Diving / Handling / Kicking / Reflexes / Speed / Positioning). */
export const GK_STATS: ReadonlyArray<{ key: FaceStatKey; label: string }> = [
  { key: "div", label: "DIV" },
  { key: "han", label: "HAN" },
  { key: "kic", label: "KIC" },
  { key: "ref", label: "REF" },
  { key: "spd", label: "SPD" },
  { key: "pos", label: "POS" },
];

const FULL_LABELS: Record<FaceStatKey, string> = {
  pac: "Pace",
  sho: "Shooting",
  pas: "Passing",
  dri: "Dribbling",
  def: "Defending",
  phy: "Physical",
  div: "Diving",
  han: "Handling",
  kic: "Kicking",
  ref: "Reflexes",
  spd: "Speed",
  pos: "Positioning",
};

export function isGoalkeeper(position: string): boolean {
  return position.toUpperCase() === "GK";
}

export function faceStatPool(position: string) {
  return isGoalkeeper(position) ? GK_STATS : OUTFIELD_STATS;
}

export function fullStatLabel(key: FaceStatKey): string {
  return FULL_LABELS[key] ?? key.toUpperCase();
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Prefer role-relevant face stats, then fill from the rest. */
function weightedPool(position: string) {
  const pool = faceStatPool(position);
  const pos = position.toUpperCase();
  let preferred: FaceStatKey[] = [];

  if (pos === "GK") {
    preferred = ["div", "ref", "pos", "han"];
  } else if (["ST", "CF"].includes(pos)) {
    preferred = ["sho", "pac", "phy", "dri"];
  } else if (["LW", "RW", "LM", "RM"].includes(pos)) {
    preferred = ["pac", "dri", "pas", "sho"];
  } else if (["CAM", "CM"].includes(pos)) {
    preferred = ["pas", "dri", "sho", "def"];
  } else if (["CDM"].includes(pos)) {
    preferred = ["def", "pas", "phy", "dri"];
  } else if (["CB", "LB", "RB", "LWB", "RWB"].includes(pos)) {
    preferred = ["def", "phy", "pac", "pas"];
  }

  const preferredSet = new Set(preferred);
  const first = pool.filter((s) => preferredSet.has(s.key));
  const rest = pool.filter((s) => !preferredSet.has(s.key));
  return [...shuffle(first), ...shuffle(rest)];
}

/**
 * Pick 2–3 face stats; each receives the full OVR bump (not split).
 * Merges with any previous boost (same key takes the higher bump).
 */
export function rollBoostedStats(
  position: string,
  ovrBump: number,
  previous: BoostedStat[] | null | undefined
): BoostedStat[] {
  const bump = Math.max(1, ovrBump);
  const ordered = weightedPool(position);
  const pickCount = Math.min(ordered.length, 2 + Math.floor(Math.random() * 2)); // 2 or 3
  const picks = ordered.slice(0, pickCount);

  const nextMap = new Map<FaceStatKey, BoostedStat>();
  for (const prev of previous ?? []) {
    if (prev?.key && prev.bump > 0) {
      nextMap.set(prev.key, {
        key: prev.key,
        label:
          prev.label ||
          faceStatPool(position).find((s) => s.key === prev.key)?.label ||
          prev.key.toUpperCase(),
        bump: prev.bump,
      });
    }
  }

  for (const stat of picks) {
    const existing = nextMap.get(stat.key);
    nextMap.set(stat.key, {
      key: stat.key,
      label: stat.label,
      // Stack: new roll adds on top of any previous bump for that stat
      bump: (existing?.bump ?? 0) + bump,
    });
  }

  return Array.from(nextMap.values()).sort((a, b) => b.bump - a.bump);
}

/** If a player already has OVR boost but no face stats (legacy), invent them once. */
export function ensureBoostedStats(
  position: string,
  baseRating: number,
  boostedRating: number | null | undefined,
  rawStats: unknown
): BoostedStat[] {
  const existing = parseBoostedStats(rawStats);
  if (existing.length > 0) return existing;
  if (boostedRating == null || boostedRating <= baseRating) return [];
  return rollBoostedStats(position, boostedRating - baseRating, null);
}

export function parseBoostedStats(raw: unknown): BoostedStat[] {
  if (!Array.isArray(raw)) return [];
  const out: BoostedStat[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = String(rec.key ?? "") as FaceStatKey;
    const bump = Number(rec.bump);
    if (!key || !Number.isFinite(bump) || bump <= 0) continue;
    const label =
      typeof rec.label === "string" && rec.label
        ? rec.label
        : FULL_LABELS[key]?.slice(0, 3).toUpperCase() ?? key.toUpperCase();
    out.push({ key, label, bump });
  }
  return out;
}

export function formatBoostedStats(stats: BoostedStat[]): string {
  if (stats.length === 0) return "";
  return stats.map((s) => `${s.label} +${s.bump}`).join(" · ");
}
