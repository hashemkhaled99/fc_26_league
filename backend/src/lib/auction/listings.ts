import { prisma } from "@/lib/prisma";
import { setAuctionEnd } from "@/lib/timerStore";
import { MARKET_DEADLINE_HOUR, REBID_TIMER_SECONDS } from "@/lib/auction/constants";

/** Minutes east of UTC for market windows (default UTC+3). Override with LISTING_TZ_OFFSET_MINUTES. */
function getListingTzOffsetMs(): number {
  const minutes = parseInt(process.env.LISTING_TZ_OFFSET_MINUTES ?? "180", 10);
  return Number.isFinite(minutes) ? minutes * 60 * 1000 : 0;
}

/**
 * End of the current market day: next 9:00 PM in the listing timezone.
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

/** True when endsAt looks like a stale midnight window rather than a snipe extension. */
function isStalePastWindowEnd(endsAt: Date, windowEnd: Date): boolean {
  const overrunMs = endsAt.getTime() - windowEnd.getTime();
  // Snipe adds +30s per bid; anything >30 min past 9 PM is a stale midnight deadline.
  return overrunMs > 30 * 60 * 1000;
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

/** Align every available player to today's fixed 9 PM window (fixes stale midnight deadlines). */
export async function syncAvailableListingsToMarketWindow(roomId: string): Promise<number> {
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

/** Pull stale midnight auction timers back to 9 PM; keep short rebid timers and snipe extensions. */
export async function syncActiveAuctionWindows(roomId: string): Promise<number> {
  const now = new Date();
  const windowEnd = getMarketWindowEnd(now);
  if (windowEnd.getTime() <= now.getTime()) return 0;

  const auctions = await prisma.auction.findMany({
    where: { roomId, status: "active", endsAt: { gt: now } },
    select: { id: true, endsAt: true },
  });

  let count = 0;
  for (const a of auctions) {
    const endsMs = a.endsAt.getTime();
    const windowMs = windowEnd.getTime();

    if (endsMs === windowMs) continue;

    // Rebid / short timers — leave alone.
    if (endsMs < windowMs) continue;

    // Snipe extension past 9 PM — leave alone.
    if (!isStalePastWindowEnd(a.endsAt, windowEnd)) continue;

    await prisma.auction.update({ where: { id: a.id }, data: { endsAt: windowEnd } });
    await setAuctionEnd(a.id, windowEnd);
    count++;
  }
  return count;
}

/** Fix transfer window if it still points at midnight instead of 9 PM. */
export async function syncRoomTransferWindow(roomId: string): Promise<boolean> {
  const settings = await prisma.roomSettings.findUnique({ where: { roomId } });
  if (!settings || settings.rebidRoundEnabled) return false;

  const windowEnd = getMarketWindowEnd();
  const current = settings.transferWindowEndsAt;
  if (current && !isStalePastWindowEnd(current, windowEnd)) return false;

  await prisma.roomSettings.update({
    where: { roomId },
    data: { transferWindowEndsAt: windowEnd },
  });
  return true;
}

/** @deprecated Use syncAvailableListingsToMarketWindow */
export async function refreshAvailableListings(roomId: string): Promise<number> {
  return syncAvailableListingsToMarketWindow(roomId);
}
