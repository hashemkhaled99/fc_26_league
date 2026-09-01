import { prisma } from "@/lib/prisma";
import { setAuctionEnd } from "@/lib/timerStore";

/** Minutes east of UTC for market windows (default UTC+3). Override with LISTING_TZ_OFFSET_MINUTES. */
function getListingTzOffsetMs(): number {
  const minutes = parseInt(process.env.LISTING_TZ_OFFSET_MINUTES ?? "180", 10);
  return Number.isFinite(minutes) ? minutes * 60 * 1000 : 0;
}

/**
 * End of the current 12-hour market window (00:00→12:00 or 12:00→00:00) in the listing timezone.
 * Shared by available players and live auctions.
 */
export function getMarketWindowEnd(from = new Date()): Date {
  const offsetMs = getListingTzOffsetMs();
  const shifted = from.getTime() + offsetMs;

  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();

  const noon = Date.UTC(y, m, day, 12, 0, 0, 0);
  const nextMidnight = Date.UTC(y, m, day + 1, 0, 0, 0, 0);

  const endShifted = shifted < noon ? noon : nextMidnight;
  return new Date(endShifted - offsetMs);
}

/** @deprecated Use getMarketWindowEnd */
export const nextListingEndsAt = getMarketWindowEnd;

export function secondsUntilMarketWindowEnd(from = new Date()): number {
  return Math.max(0, Math.ceil((getMarketWindowEnd(from).getTime() - from.getTime()) / 1000));
}

/** Align all available catalog players to the current shared market window. */
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
 * Keep every available player on the same synchronized window.
 * When a window ends with no auction, players are re-listed for the next 12h window.
 */
export async function refreshAvailableListings(roomId: string): Promise<number> {
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

/** Live auctions share the same window deadline — never reset to the admin bid timer. */
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
    if (a.endsAt.getTime() === windowEnd.getTime()) continue;
    // Keep snipe extensions that pushed the deadline past the shared window end.
    if (a.endsAt.getTime() > windowEnd.getTime()) continue;
    await prisma.auction.update({ where: { id: a.id }, data: { endsAt: windowEnd } });
    await setAuctionEnd(a.id, windowEnd);
    count++;
  }
  return count;
}
