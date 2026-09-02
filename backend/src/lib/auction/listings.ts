import { prisma } from "@/lib/prisma";
import { MARKET_DEADLINE_HOUR, REBID_TIMER_SECONDS } from "@/lib/auction/constants";

/** Minutes east of UTC for market windows (default UTC+3). Override with LISTING_TZ_OFFSET_MINUTES. */
function getListingTzOffsetMs(): number {
  const minutes = parseInt(process.env.LISTING_TZ_OFFSET_MINUTES ?? "180", 10);
  return Number.isFinite(minutes) ? minutes * 60 * 1000 : 0;
}

/**
 * End of the current market day: next 9:00 PM in the listing timezone.
 * All available players and live auctions share this fixed deadline.
 * Timers are set once and never refreshed on page loads.
 */
export function getMarketWindowEnd(from = new Date()): Date {
  const offsetMs = getListingTzOffsetMs();
  const shifted = from.getTime() + offsetMs;

  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hour = d.getUTCHours();

  const deadlineHour = Number.isFinite(MARKET_DEADLINE_HOUR) ? MARKET_DEADLINE_HOUR : 21;
  let targetDay = day;
  if (hour >= deadlineHour) {
    targetDay = day + 1;
  }

  const deadline = Date.UTC(y, m, targetDay, deadlineHour, 0, 0, 0);
  return new Date(deadline - offsetMs);
}

/** @deprecated Use getMarketWindowEnd */
export const nextListingEndsAt = getMarketWindowEnd;

export function secondsUntilMarketWindowEnd(from = new Date()): number {
  return Math.max(0, Math.ceil((getMarketWindowEnd(from).getTime() - from.getTime()) / 1000));
}

export function getRebidAuctionEnd(from = new Date()): Date {
  return new Date(from.getTime() + REBID_TIMER_SECONDS * 1000);
}

export function secondsUntilRebidEnd(from = new Date()): number {
  return REBID_TIMER_SECONDS;
}

export function isPastMarketDeadline(now = new Date()): boolean {
  const windowEnd = getMarketWindowEnd(now);
  return now.getTime() >= windowEnd.getTime();
}

/** True when the player has never had any auction started on them. */
export async function isUnbidPlayer(playerId: string): Promise<boolean> {
  const count = await prisma.auction.count({ where: { playerId } });
  return count === 0;
}

/** Set the shared 9 PM deadline on all available players when bidding opens. */
export async function initializeAvailableListings(roomId: string): Promise<number> {
  const endsAt = getMarketWindowEnd();
  const result = await prisma.player.updateMany({
    where: {
      roomId,
      status: "available",
      isIcon: false,
      isHero: false,
    },
    data: { listingEndsAt: endsAt },
  });
  return result.count;
}

/**
 * Only fill missing listing deadlines — never overwrite an existing fixed deadline.
 */
export async function ensureListingDeadlines(roomId: string): Promise<number> {
  const endsAt = getMarketWindowEnd();

  const result = await prisma.player.updateMany({
    where: {
      roomId,
      status: "available",
      isIcon: false,
      isHero: false,
      listingEndsAt: null,
    },
    data: { listingEndsAt: endsAt },
  });

  return result.count;
}

/** @deprecated Timers are no longer refreshed on each request. Use ensureListingDeadlines. */
export async function refreshAvailableListings(roomId: string): Promise<number> {
  return ensureListingDeadlines(roomId);
}

/** @deprecated Active auction timers are fixed at start — no longer synced on each request. */
export async function syncActiveAuctionWindows(_roomId: string): Promise<number> {
  return 0;
}
