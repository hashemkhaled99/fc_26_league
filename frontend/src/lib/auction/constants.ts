export const SQUAD_LIMIT = 21;
export const MAX_STARTERS = 11;
export const MIN_BID_INCREMENT = 1000000; // 1M
export const DEFAULT_STARTING_BID = 5_000_000; // 5M
export const BID_RATE_LIMIT_MS = 500;

/** Maximum auction timer duration (12 hours). Stored in DB as seconds. */
export const MAX_BID_TIMER_SECONDS = 12 * 60 * 60;

/** How long an available (unauctioned) player stays listed before auto re-listing. */
export const LISTING_DURATION_SECONDS = MAX_BID_TIMER_SECONDS;

/** Shared market deadline hour in listing timezone (21 = 9 PM). Override with MARKET_DEADLINE_HOUR. */
export const MARKET_DEADLINE_HOUR = parseInt(process.env.MARKET_DEADLINE_HOUR ?? "21", 10);
/** Shared market deadline minute (45 = :45). Override with MARKET_DEADLINE_MINUTE. */
export const MARKET_DEADLINE_MINUTE = parseInt(process.env.MARKET_DEADLINE_MINUTE ?? "45", 10);

/** Short timer for the post-deadline rebid round (un-bid players only). */
export const REBID_TIMER_SECONDS = 120;

/** Only extend the auction clock when this many seconds or less remain. */
export const BID_EXTEND_THRESHOLD_SEC = 60;
/** Seconds added per bid during the final minute. */
export const BID_EXTEND_BY_SEC = 30;

export const POSITIONS = [
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
] as const;

export type Position = typeof POSITIONS[number];
