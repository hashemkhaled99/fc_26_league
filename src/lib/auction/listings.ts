import { prisma } from "@/lib/prisma";
import { setAuctionEnd } from "@/lib/timerStore";
import { MARKET_DEADLINE_HOUR, MARKET_DEADLINE_MINUTE, REBID_TIMER_SECONDS } from "@/lib/auction/constants";

/** Minutes east of UTC for market windows (default UTC+3). Override with LISTING_TZ_OFFSET_MINUTES. */
function getListingTzOffsetMs(): number {
  const minutes = parseInt(process.env.LISTING_TZ_OFFSET_MINUTES ?? "180", 10);
  return Number.isFinite(minutes) ? minutes * 60 * 1000 : 0;
}

/**
 * End of the current market day: next 9:30 PM in the listing timezone.
 * All available players and live auctions share this fixed deadline.
 */
export function getMarketWindowEnd(from = new Date()): Date {
  const offsetMs = getListingTzOffsetMs();
  const shifted = from.getTime() + offsetMs;

  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();

  const deadlineHour = Number.isFinite(MARKET_DEADLINE_HOUR) ? MARKET_DEADLINE_HOUR : 21;
  const deadlineMinute = Number.isFinite(MARKET_DEADLINE_MINUTE) ? MARKET_DEADLINE_MINUTE : 30;
  let targetDay = day;
  if (hour > deadlineHour || (hour === deadlineHour && minute >= deadlineMinute)) {
    targetDay = day + 1;
  }

  const deadline = Date.UTC(y, m, targetDay, deadlineHour, deadlineMinute, 0, 0);
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

/** True when endsAt looks like a stale midnight window rather than a snipe extension. */
function isStalePastWindowEnd(endsAt: Date, windowEnd: Date): boolean {
  const overrunMs = endsAt.getTime() - windowEnd.getTime();
  // Snipe adds +30s per bid; anything >30 min past 9 PM is a stale midnight deadline.
  return overrunMs > 30 * 60 * 1000;
}

/** Process-local caches — avoid redoing heavy market maintenance on every page load. */
const listingSyncCache = new Map<string, string>(); // roomId → windowEnd ISO
const auctionSyncCache = new Map<string, string>();
const transferSyncCache = new Map<string, string>();

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
  listingSyncCache.set(roomId, endsAt.toISOString());
  return result.count;
}

/**
 * Align available players to today's 9 PM window.
 * Skips when this process already synced the room for the current window,
 * and only updates rows that are null or still on a different deadline.
 */
export async function syncAvailableListingsToMarketWindow(roomId: string): Promise<number> {
  const endsAt = getMarketWindowEnd();
  const cacheKey = endsAt.toISOString();
  if (listingSyncCache.get(roomId) === cacheKey) return 0;

  const result = await prisma.player.updateMany({
    where: {
      roomId,
      status: "available",
      isIcon: false,
      isHero: false,
      OR: [{ listingEndsAt: null }, { listingEndsAt: { not: endsAt } }],
    },
    data: { listingEndsAt: endsAt },
  });

  listingSyncCache.set(roomId, cacheKey);
  return result.count;
}

/** Only fill players that never received a listing deadline. */
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

/** Pull stale/old shared-window auction timers to 9:30 PM; keep short rebid timers and snipe extensions. */
export async function syncActiveAuctionWindows(roomId: string): Promise<number> {
  const now = new Date();
  const windowEnd = getMarketWindowEnd(now);
  if (windowEnd.getTime() <= now.getTime()) return 0;

  const cacheKey = windowEnd.toISOString();
  if (auctionSyncCache.get(roomId) === cacheKey) return 0;

  // Don't touch short rebid timers (~2 min). Shared market auctions are much longer.
  const minSharedRemainingMs = 5 * 60 * 1000;
  const staleAfter = new Date(windowEnd.getTime() + 30 * 60 * 1000);

  const auctions = await prisma.auction.findMany({
    where: {
      roomId,
      status: "active",
      endsAt: { gt: now },
      OR: [
        // Old midnight deadlines past the new window
        { endsAt: { gt: staleAfter } },
        // Previous shared window (e.g. 9:00) that should move to 9:30
        {
          endsAt: {
            lt: windowEnd,
            gt: new Date(now.getTime() + minSharedRemainingMs),
          },
        },
      ],
    },
    select: { id: true },
  });

  if (auctions.length === 0) {
    auctionSyncCache.set(roomId, cacheKey);
    return 0;
  }

  await prisma.auction.updateMany({
    where: { id: { in: auctions.map((a) => a.id) } },
    data: { endsAt: windowEnd },
  });

  await Promise.all(auctions.map((a) => setAuctionEnd(a.id, windowEnd)));
  auctionSyncCache.set(roomId, cacheKey);
  return auctions.length;
}

/** Fix transfer window if it still points at midnight instead of 9 PM. */
export async function syncRoomTransferWindow(
  roomId: string,
  existingSettings?: { transferWindowEndsAt: Date | null; rebidRoundEnabled: boolean } | null
): Promise<boolean> {
  const windowEnd = getMarketWindowEnd();
  const cacheKey = windowEnd.toISOString();
  if (transferSyncCache.get(roomId) === cacheKey) return false;

  const settings =
    existingSettings !== undefined
      ? existingSettings
      : await prisma.roomSettings.findUnique({
          where: { roomId },
          select: { transferWindowEndsAt: true, rebidRoundEnabled: true },
        });

  if (!settings || settings.rebidRoundEnabled) {
    transferSyncCache.set(roomId, cacheKey);
    return false;
  }

  const current = settings.transferWindowEndsAt;
  if (current && !isStalePastWindowEnd(current, windowEnd)) {
    transferSyncCache.set(roomId, cacheKey);
    return false;
  }

  await prisma.roomSettings.update({
    where: { roomId },
    data: { transferWindowEndsAt: windowEnd },
  });
  transferSyncCache.set(roomId, cacheKey);
  return true;
}

/**
 * Lightweight market maintenance — safe to call on every market GET.
 * Uses process caches so warm requests skip almost all DB writes.
 */
export async function prepareMarketWindow(
  roomId: string,
  settings?: { transferWindowEndsAt: Date | null; rebidRoundEnabled: boolean } | null
): Promise<Date> {
  await Promise.all([
    syncAvailableListingsToMarketWindow(roomId),
    syncActiveAuctionWindows(roomId),
    syncRoomTransferWindow(roomId, settings),
  ]);
  return getMarketWindowEnd();
}

/** @deprecated Use syncAvailableListingsToMarketWindow */
export async function refreshAvailableListings(roomId: string): Promise<number> {
  return syncAvailableListingsToMarketWindow(roomId);
}
