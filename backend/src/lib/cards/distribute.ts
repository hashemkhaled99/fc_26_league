import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FIXTURE_CARD_KEYS,
  DEFAULT_TRANSFER_CARD_KEYS,
  pickWeightedCardKeys,
  type CardCategory,
} from "./types";

const TRANSFER_CARDS_PER_USER = 2;
const FIXTURE_CARDS_PER_USER = 3;

async function distributeCards(
  roomId: string,
  category: CardCategory,
  perUser: number,
  onlyUserIds?: string[]
) {
  const settings = await prisma.roomSettings.findUnique({ where: { roomId } });
  const enabledAll = settings?.enabledCardTypes ?? [];
  const defaults =
    category === "transfer" ? DEFAULT_TRANSFER_CARD_KEYS : DEFAULT_FIXTURE_CARD_KEYS;
  // If admin enabled a subset, filter to this category; empty = all of category
  const enabled =
    enabledAll.length > 0
      ? enabledAll.filter((k) => defaults.includes(k as (typeof defaults)[number]))
      : [...defaults];
  const poolKeys = enabled.length > 0 ? enabled : [...defaults];

  const users = await prisma.user.findMany({
    where: {
      roomId,
      ...(onlyUserIds && onlyUserIds.length > 0 ? { id: { in: onlyUserIds } } : {}),
    },
    select: { id: true },
  });

  // Only clear unused cards of this category (for selected users if filtered)
  await prisma.card.deleteMany({
    where: {
      roomId,
      used: false,
      category,
      ...(onlyUserIds && onlyUserIds.length > 0 ? { ownerId: { in: onlyUserIds } } : {}),
    },
  });

  let dealt = 0;
  for (const user of users) {
    const types = pickWeightedCardKeys(poolKeys, perUser, category, true);
    if (types.length === 0) continue;
    await prisma.card.createMany({
      data: types.map((type) => ({
        roomId,
        ownerId: user.id,
        type,
        category,
        used: false,
        metadata: {
          dealtAt: new Date().toISOString(),
          category,
        },
      })),
    });
    dealt++;
  }

  return { users: users.length, cardsEach: perUser, dealt, category };
}

/** 2 transfer cards each when bidding starts / redistribute. */
export async function distributeTransferCards(
  roomId: string,
  perUser = TRANSFER_CARDS_PER_USER
) {
  return distributeCards(roomId, "transfer", perUser);
}

/** 3 fixture cards each for the whole league (called on Start League). */
export async function distributeFixtureCards(
  roomId: string,
  perUser = FIXTURE_CARDS_PER_USER,
  onlyUserIds?: string[]
) {
  // Don't redeal if selected users already have unused fixture cards
  const existing = await prisma.card.count({
    where: {
      roomId,
      category: "fixture",
      used: false,
      ...(onlyUserIds && onlyUserIds.length > 0 ? { ownerId: { in: onlyUserIds } } : {}),
    },
  });
  if (existing > 0) {
    return {
      users: 0,
      cardsEach: perUser,
      dealt: 0,
      category: "fixture" as const,
      skipped: true,
    };
  }
  return distributeCards(roomId, "fixture", perUser, onlyUserIds);
}
