export type CardRarity = "common" | "rare" | "epic";
export type CardCategory = "transfer" | "fixture";
export type CardTarget =
  | "none"
  | "auction"
  | "player_available"
  | "own_squad"
  | "user"
  | "opponent_squad"
  | "match";

export interface CardDef {
  key: string;
  name: string;
  description: string;
  rarity: CardRarity;
  category: CardCategory;
  target: CardTarget;
}

/**
 * Transfer cards — 2 per manager at bidding start.
 * Fixture cards — 3 per manager for the whole league (Start League).
 */
export const CARD_TYPES: readonly CardDef[] = [
  {
    key: "cash_injection",
    name: "Cash Injection",
    description: "Instant +15–25M added to your transfer budget.",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "scout_bonus",
    name: "Scout Bonus",
    description: "Club pays you a small scout fee: +8M.",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "mega_injection",
    name: "Mega Injection",
    description: "Board panic-buys: +40M once.",
    rarity: "epic",
    category: "transfer",
    target: "none",
  },
  {
    key: "underdog_fund",
    name: "Underdog Fund",
    description: "If your squad average rating is under 82, gain +20M. Otherwise +5M.",
    rarity: "rare",
    category: "transfer",
    target: "none",
  },
  {
    key: "tax_refund",
    name: "Tax Refund",
    description: "Refund 50% of your last completed sale (resale or trade cash out).",
    rarity: "rare",
    category: "transfer",
    target: "none",
  },
  {
    key: "fee_rebate",
    name: "Fee Rebate",
    description: "Your next auction win refunds 10% of the final bid to your budget.",
    rarity: "rare",
    category: "transfer",
    target: "none",
  },
  {
    key: "deadline_gift",
    name: "Deadline Gift",
    description: "+12M now. If transfer window ends within 1 hour, +8M more.",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "bargain_hunter",
    name: "Bargain Hunter",
    description: "Your next started auction opens at 4M instead of 5M.",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "soft_raise",
    name: "Soft Raise",
    description: "Your next outbid only needs to match the current bid (no +1M).",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "overdraft",
    name: "Overdraft",
    description: "Once, bid up to 5M over your available budget.",
    rarity: "epic",
    category: "transfer",
    target: "none",
  },
  {
    key: "sniper_guard",
    name: "Sniper Guard",
    description: "After you bid on an auction, nobody can outbid you for 20 seconds.",
    rarity: "rare",
    category: "transfer",
    target: "auction",
  },
  {
    key: "time_warp",
    name: "Time Warp",
    description: "Add +25 seconds to an auction you are currently winning.",
    rarity: "common",
    category: "transfer",
    target: "auction",
  },
  {
    key: "exclusive_rights",
    name: "Exclusive Rights",
    description: "For 60 seconds, only you can bid on a chosen live auction.",
    rarity: "epic",
    category: "transfer",
    target: "auction",
  },
  {
    key: "first_dibs",
    name: "First Dibs",
    description: "Start an auction on an available player; rivals cannot bid for 45 seconds.",
    rarity: "rare",
    category: "transfer",
    target: "player_available",
  },
  {
    key: "silent_bid",
    name: "Silent Operator",
    description: "Your next bid is not broadcast to the room toast feed.",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "freeze_auction",
    name: "Freeze Auction",
    description: "Freeze a live auction for 45 seconds (timer pauses).",
    rarity: "rare",
    category: "transfer",
    target: "auction",
  },
  {
    key: "bid_ban",
    name: "Bid Ban",
    description: "Block one rival from bidding on one live auction for 90 seconds.",
    rarity: "rare",
    category: "transfer",
    target: "auction",
  },
  {
    key: "price_trap",
    name: "Price Trap",
    description: "Mark an available player: next auction on them must start at +50% price.",
    rarity: "rare",
    category: "transfer",
    target: "player_available",
  },
  {
    key: "blacklist",
    name: "Blacklist",
    description: "Hide an available player from everyone else's market list for 3 minutes.",
    rarity: "epic",
    category: "transfer",
    target: "player_available",
  },
  {
    key: "whip_round",
    name: "Whip Round",
    description: "Add +15 seconds to every live auction you are currently winning.",
    rarity: "rare",
    category: "transfer",
    target: "none",
  },
  {
    key: "bid_shield",
    name: "Bid Shield",
    description: "Protect your resale: for 2 minutes rivals need +3M extra to take the lead.",
    rarity: "rare",
    category: "transfer",
    target: "auction",
  },
  {
    key: "panic_sell",
    name: "Panic Sell",
    description: "Instantly sell one of your squad players for 70% of market value.",
    rarity: "common",
    category: "transfer",
    target: "own_squad",
  },
  {
    key: "soft_cap",
    name: "Emergency Seat",
    description: "Allow one extra squad slot (19) until you sell or the window closes.",
    rarity: "epic",
    category: "transfer",
    target: "none",
  },
  {
    key: "free_agent",
    name: "Free Agent Coup",
    description: "Claim a random available player rated 75–80 for free.",
    rarity: "rare",
    category: "transfer",
    target: "none",
  },
  {
    key: "clone",
    name: "Clone",
    description: "Copy an opponent's squad player into yours for this season.",
    rarity: "epic",
    category: "transfer",
    target: "opponent_squad",
  },
  {
    key: "scout_report",
    name: "Scout Report",
    description: "Reveal the 8 highest-rated still-available players on the market.",
    rarity: "common",
    category: "transfer",
    target: "none",
  },
  {
    key: "budget_peek",
    name: "Budget Peek",
    description: "See one rival's available (uncommitted) budget.",
    rarity: "rare",
    category: "transfer",
    target: "user",
  },
  {
    key: "boost_steal",
    name: "Boost Steal",
    description: "Steal a bot rating boost from an opponent's player onto one of yours.",
    rarity: "epic",
    category: "transfer",
    target: "opponent_squad",
  },
  {
    key: "free_icon",
    name: "Free Icon",
    description: "Add a random Icon-tier player to your squad for free.",
    rarity: "epic",
    category: "transfer",
    target: "none",
  },
  {
    key: "mystery_box",
    name: "Mystery Box",
    description: "Transform into another random unused transfer card instantly.",
    rarity: "rare",
    category: "transfer",
    target: "none",
  },
  {
    key: "double_points",
    name: "Double Points",
    description: "Your next confirmed win is worth 6 points instead of 3.",
    rarity: "epic",
    category: "fixture",
    target: "none",
  },
  {
    key: "clean_sheet_cash",
    name: "Clean Sheet Cash",
    description: "If you concede 0 in your next confirmed match, earn +12M.",
    rarity: "rare",
    category: "fixture",
    target: "none",
  },
  {
    key: "goal_bounty",
    name: "Goal Bounty",
    description: "Earn +2M for every goal you score in your next confirmed match.",
    rarity: "common",
    category: "fixture",
    target: "none",
  },
  {
    key: "draw_insurance",
    name: "Draw Insurance",
    description: "If your next confirmed match is a draw, pocket +10M.",
    rarity: "common",
    category: "fixture",
    target: "none",
  },
  {
    key: "home_crowd",
    name: "Home Crowd",
    description: "Win your next home fixture → +15M.",
    rarity: "rare",
    category: "fixture",
    target: "none",
  },
  {
    key: "away_day",
    name: "Away Day",
    description: "Win your next away fixture → +18M.",
    rarity: "rare",
    category: "fixture",
    target: "none",
  },
  {
    key: "matchday_pay",
    name: "Matchday Pay",
    description: "When your next match is confirmed (any result), earn +6M appearance fee.",
    rarity: "common",
    category: "fixture",
    target: "none",
  },
  {
    key: "must_win_wager",
    name: "Must Win Wager",
    description: "Next match: win = +25M, loss = −8M, draw = 0.",
    rarity: "epic",
    category: "fixture",
    target: "none",
  },
  {
    key: "streak_saver",
    name: "Streak Saver",
    description: "Your next loss does not reset a winning streak.",
    rarity: "rare",
    category: "fixture",
    target: "none",
  },
  {
    key: "injury_fund",
    name: "Injury Fund",
    description: "Immediate +15M league emergency cash.",
    rarity: "common",
    category: "fixture",
    target: "none",
  },
  {
    key: "scout_xi",
    name: "Scout XI",
    description: "Peek at a rival's full squad list before you face them.",
    rarity: "common",
    category: "fixture",
    target: "user",
  },
  {
    key: "derby_boost",
    name: "Derby Boost",
    description: "Attach to a scheduled match you're in: +8M when that fixture is confirmed.",
    rarity: "rare",
    category: "fixture",
    target: "match",
  },
] as const;

export type CardTypeKey = (typeof CARD_TYPES)[number]["key"];

export const CARD_BY_KEY: Record<string, CardDef> = Object.fromEntries(
  CARD_TYPES.map((c) => [c.key, c])
);

export const DEFAULT_TRANSFER_CARD_KEYS: CardTypeKey[] = CARD_TYPES.filter(
  (c) => c.category === "transfer"
).map((c) => c.key);

export const DEFAULT_FIXTURE_CARD_KEYS: CardTypeKey[] = CARD_TYPES.filter(
  (c) => c.category === "fixture"
).map((c) => c.key);

export const DEFAULT_CARD_TYPES = DEFAULT_TRANSFER_CARD_KEYS;

export function rarityWeight(rarity: CardRarity): number {
  if (rarity === "common") return 50;
  if (rarity === "rare") return 30;
  return 12;
}

export function pickWeightedCardKeys(
  enabled: string[],
  count: number,
  category: CardCategory,
  avoidDuplicates = true
): string[] {
  const pool = CARD_TYPES.filter(
    (c) =>
      c.category === category &&
      (enabled.length === 0 || enabled.includes(c.key))
  );
  if (pool.length === 0) return [];

  const picked: string[] = [];
  const available = [...pool];

  for (let i = 0; i < count && available.length > 0; i++) {
    const total = available.reduce((s, c) => s + rarityWeight(c.rarity), 0);
    let roll = Math.random() * total;
    let chosen = available[0];
    for (const c of available) {
      roll -= rarityWeight(c.rarity);
      if (roll <= 0) {
        chosen = c;
        break;
      }
    }
    picked.push(chosen.key);
    if (avoidDuplicates) {
      const idx = available.findIndex((c) => c.key === chosen.key);
      if (idx >= 0) available.splice(idx, 1);
    }
  }
  return picked;
}
