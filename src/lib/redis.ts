import Redis from "ioredis";

/**
 * Redis is optional. Set ENABLE_REDIS=true when you have Redis running.
 * Without it, auctions still close via Postgres endsAt polling.
 */
let redis: Redis | null = null;
let redisDisabled = process.env.ENABLE_REDIS !== "true";
let warnedOnce = false;

export function isRedisEnabled(): boolean {
  return !redisDisabled;
}

export function getRedis(): Redis | null {
  if (redisDisabled) return null;

  if (!redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null, // don't keep retrying
    });

    redis.on("error", () => {
      if (!warnedOnce) {
        console.warn("[redis] Unavailable — using DB-only auction timers");
        warnedOnce = true;
      }
      redisDisabled = true;
      try {
        redis?.disconnect();
      } catch {
        /* ignore */
      }
      redis = null;
    });
  }

  return redis;
}

export async function withRedis<T>(fn: (client: Redis) => Promise<T>): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    if (client.status !== "ready") await client.connect();
    return await fn(client);
  } catch {
    if (!warnedOnce) {
      console.warn("[redis] Unavailable — using DB-only auction timers");
      warnedOnce = true;
    }
    redisDisabled = true;
    return null;
  }
}
