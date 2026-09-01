import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getActiveEffects(roomId: string, now = new Date()) {
  return prisma.marketEffect.findMany({
    where: {
      roomId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function createEffect(data: {
  roomId: string;
  type: string;
  casterId: string;
  targetUserId?: string | null;
  playerId?: string | null;
  auctionId?: string | null;
  expiresAt?: Date | null;
  payload?: Record<string, unknown> | null;
}) {
  return prisma.marketEffect.create({
    data: {
      roomId: data.roomId,
      type: data.type,
      casterId: data.casterId,
      targetUserId: data.targetUserId ?? null,
      playerId: data.playerId ?? null,
      auctionId: data.auctionId ?? null,
      expiresAt: data.expiresAt ?? null,
      payload: data.payload as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function consumeOneShotEffect(
  roomId: string,
  type: string,
  casterId: string
) {
  const effect = await prisma.marketEffect.findFirst({
    where: { roomId, type, casterId },
    orderBy: { createdAt: "asc" },
  });
  if (!effect) return null;
  await prisma.marketEffect.delete({ where: { id: effect.id } });
  return effect;
}

export function isAuctionFrozen(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  auctionId: string,
  now = Date.now()
) {
  return effects.some(
    (e) =>
      e.type === "freeze_auction" &&
      e.auctionId === auctionId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}

export function getBidBan(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  auctionId: string,
  userId: string,
  now = Date.now()
) {
  return effects.find(
    (e) =>
      e.type === "bid_ban" &&
      e.auctionId === auctionId &&
      e.targetUserId === userId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}

export function getExclusiveRights(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  auctionId: string,
  now = Date.now()
) {
  return effects.find(
    (e) =>
      e.type === "exclusive_rights" &&
      e.auctionId === auctionId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}

export function getSniperGuard(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  auctionId: string,
  now = Date.now()
) {
  return effects.find(
    (e) =>
      e.type === "sniper_guard" &&
      e.auctionId === auctionId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}

export function getFirstDibs(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  auctionId: string,
  now = Date.now()
) {
  return effects.find(
    (e) =>
      e.type === "first_dibs" &&
      e.auctionId === auctionId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}

export function getBidShield(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  auctionId: string,
  now = Date.now()
) {
  return effects.find(
    (e) =>
      e.type === "bid_shield" &&
      e.auctionId === auctionId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}

export function getPriceTrap(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  playerId: string
) {
  return effects.find((e) => e.type === "price_trap" && e.playerId === playerId);
}

export function getBlacklists(
  effects: Awaited<ReturnType<typeof getActiveEffects>>,
  viewerId: string,
  now = Date.now()
) {
  return effects.filter(
    (e) =>
      e.type === "blacklist" &&
      e.playerId &&
      e.casterId !== viewerId &&
      e.expiresAt &&
      e.expiresAt.getTime() > now
  );
}
