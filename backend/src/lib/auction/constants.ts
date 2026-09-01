export const SQUAD_LIMIT = 18;
export const MAX_STARTERS = 11;
export const MIN_BID_INCREMENT = 1000000; // 1M
export const DEFAULT_STARTING_BID = 5_000_000; // 5M
export const BID_RATE_LIMIT_MS = 500;

/** When a bid is placed with this many seconds or less remaining, extend the timer. */
export const BID_EXTEND_THRESHOLD_SEC = 30;
export const BID_EXTEND_BY_SEC = 30;

export const POSITIONS = [
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
] as const;

export type Position = typeof POSITIONS[number];
