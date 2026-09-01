import { withRedis } from "@/lib/redis";

const EXPIRE_KEY = "auctions:expiring";

/** In-memory fallback when Redis is off (local dev / no Redis) */
const memoryExpiry = new Map<string, number>();

export async function setAuctionExpiry(auctionId: string, endsAt: Date): Promise<void> {
  const ms = endsAt.getTime();
  memoryExpiry.set(auctionId, ms);

  await withRedis(async (redis) => {
    await redis.zadd(EXPIRE_KEY, ms, auctionId);
  });
}

export async function removeAuctionExpiry(auctionId: string): Promise<void> {
  memoryExpiry.delete(auctionId);

  await withRedis(async (redis) => {
    await redis.zrem(EXPIRE_KEY, auctionId);
  });
}

export async function getExpiredAuctionIds(now = Date.now()): Promise<string[]> {
  const fromRedis = await withRedis(async (redis) => {
    return redis.zrangebyscore(EXPIRE_KEY, 0, now);
  });

  if (fromRedis && fromRedis.length > 0) {
    return fromRedis;
  }

  const expired: string[] = [];
  for (const [id, endsAt] of memoryExpiry.entries()) {
    if (endsAt <= now) expired.push(id);
  }
  return expired;
}
