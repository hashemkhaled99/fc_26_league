import { prisma } from "@/lib/prisma";

/** Minutes east of UTC for listing windows (default UTC+3). Override with LISTING_TZ_OFFSET_MINUTES. */
function getListingTzOffsetMs(): number {
  const minutes = parseInt(process.env.LISTING_TZ_OFFSET_MINUTES ?? "180", 10);
  return Number.isFinite(minutes) ? minutes * 60 * 1000 : 0;
}

/**
 * Shared listing deadline for all available players.
 * 12-hour windows aligned to 00:00 and 12:00 in the listing timezone.
 */
export function nextListingEndsAt(from = new Date()): Date {
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

/** Align all available catalog players to the current shared listing window. */
export async function initializeAvailableListings(roomId: string): Promise<number> {
  const endsAt = nextListingEndsAt();
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
 * Expired listings roll forward to the next 00:00 / 12:00 boundary (re-list).
 */
export async function refreshAvailableListings(roomId: string): Promise<number> {
  const endsAt = nextListingEndsAt();

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
