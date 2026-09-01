import Redis from "ioredis";

const EXPIRE_KEY = "auctions:expiring";

/**
 * In-memory fallback — fine for a single-instance deployment with 10–20 users.
 * If this service is ever scaled to multiple instances, or Redis is added back later,
 * switch back to the Redis-backed implementation by setting REDIS_URL.
 */
const memoryExpiry = new Map<string, number>();

let redis: Redis | null = null;

function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }
  return redis;
}

export async function setAuctionEnd(auctionId: string, endsAt: Date): Promise<void> {
  const ms = endsAt.getTime();

  if (redisConfigured()) {
    await getRedis().zadd(EXPIRE_KEY, ms, auctionId);
    return;
  }

  memoryExpiry.set(auctionId, ms);
}

export async function getAuctionEnd(auctionId: string): Promise<Date | null> {
  if (redisConfigured()) {
    const score = await getRedis().zscore(EXPIRE_KEY, auctionId);
    if (score === null) return null;
    return new Date(Number(score));
  }

  const ms = memoryExpiry.get(auctionId);
  return ms !== undefined ? new Date(ms) : null;
}

export async function clearAuctionEnd(auctionId: string): Promise<void> {
  if (redisConfigured()) {
    await getRedis().zrem(EXPIRE_KEY, auctionId);
    return;
  }

  memoryExpiry.delete(auctionId);
}

/** Auction IDs whose timer has not yet elapsed. */
export async function getAllActiveAuctionIds(now = Date.now()): Promise<string[]> {
  if (redisConfigured()) {
    return getRedis().zrangebyscore(EXPIRE_KEY, now + 1, "+inf");
  }

  const ids: string[] = [];
  for (const [id, endsAt] of memoryExpiry.entries()) {
    if (endsAt > now) ids.push(id);
  }
  return ids;
}

/** Auction IDs whose timer has elapsed (used by the background closer worker). */
export async function getExpiredAuctionIds(now = Date.now()): Promise<string[]> {
  if (redisConfigured()) {
    return getRedis().zrangebyscore(EXPIRE_KEY, 0, now);
  }

  const expired: string[] = [];
  for (const [id, endsAt] of memoryExpiry.entries()) {
    if (endsAt <= now) expired.push(id);
  }
  return expired;
}

/** Ping Redis when configured — used by /health. */
export async function pingRedis(): Promise<boolean> {
  if (!redisConfigured()) return false;

  try {
    const client = getRedis();
    if (client.status !== "ready") await client.connect();
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
