import { prisma } from "@/lib/prisma";
import { SQUAD_LIMIT } from "@/lib/auction/constants";
import { MAX_OPENABLE_BOXES } from "./constants";

async function takeIconIntoSquad(
  userId: string,
  sourcePlayerId: string
): Promise<string> {
  const player = await prisma.player.findUnique({ where: { id: sourcePlayerId } });
  if (!player) throw new Error("Pack player missing");

  const poolStatus = player.isHero ? "hero_pool" : "icon_pool";
  const alreadyOwned = await prisma.squadPlayer.findUnique({
    where: { playerId: sourcePlayerId },
  });

  let playerId = sourcePlayerId;
  if (player.status !== poolStatus || alreadyOwned) {
    const clone = await prisma.player.create({
      data: {
        roomId: player.roomId,
        name: player.name,
        realTeam: player.realTeam,
        league: player.league,
        position: player.position,
        baseRating: player.baseRating,
        marketValue: player.marketValue,
        status: "owned",
        isIcon: player.isIcon,
        isHero: player.isHero,
      },
    });
    playerId = clone.id;
  } else {
    await prisma.player.update({
      where: { id: playerId },
      data: { status: "owned" },
    });
  }

  await prisma.squadPlayer.create({
    data: {
      userId,
      playerId,
      isStarting: false,
      purchasePrice: 0,
    },
  });

  return playerId;
}

async function tryAddIcon(
  userId: string,
  playerId: string,
  allowOverflow: boolean
): Promise<{ status: "completed" | "awaiting_replacement"; chosenId: string }> {
  const squadCount = await prisma.squadPlayer.count({ where: { userId } });
  if (squadCount >= SQUAD_LIMIT && !allowOverflow) {
    return { status: "awaiting_replacement", chosenId: playerId };
  }
  const chosenId = await takeIconIntoSquad(userId, playerId);
  return { status: "completed", chosenId };
}

async function userBoxes(userId: string, boxId: string) {
  const box = await prisma.iconBox.findUnique({ where: { id: boxId } });
  if (!box || box.userId !== userId) throw new Error("Box not found");
  const all = await prisma.iconBox.findMany({
    where: {
      userId,
      season: box.season,
      kind: box.kind,
    },
  });
  return { box, all };
}

function finishedDecisionCount(boxes: { status: string }[]) {
  return boxes.filter((b) =>
    ["completed", "awaiting_replacement", "abandoned"].includes(b.status)
  ).length;
}

function hasPendingDecision(boxes: { status: string }[]) {
  return boxes.some((b) => b.status === "option_a_revealed");
}

async function blockRemainingPending(
  userId: string,
  season: number,
  kind: string
) {
  await prisma.iconBox.updateMany({
    where: { userId, season, kind, status: "pending" },
    data: { status: "blocked" },
  });
}

async function afterDecision(
  userId: string,
  season: number,
  kind: string,
  all: { status: string }[]
) {
  if (finishedDecisionCount(all) >= MAX_OPENABLE_BOXES) {
    await blockRemainingPending(userId, season, kind);
  }
}

export async function revealOptionA(boxId: string, userId: string) {
  const { box, all } = await userBoxes(userId, boxId);
  if (box.status === "blocked") throw new Error("This box is locked");
  if (box.status !== "pending") throw new Error("Box already opened");
  if (hasPendingDecision(all)) {
    throw new Error("Finish your current box before opening another");
  }
  if (finishedDecisionCount(all) >= MAX_OPENABLE_BOXES) {
    throw new Error(`You can only open ${MAX_OPENABLE_BOXES} boxes`);
  }

  return prisma.iconBox.update({
    where: { id: boxId },
    data: { revealedOptionA: true, status: "option_a_revealed" },
  });
}

export async function keepOptionA(boxId: string, userId: string, allowOverflow: boolean) {
  const { box, all } = await userBoxes(userId, boxId);
  if (box.status !== "option_a_revealed") throw new Error("Reveal Option A first");

  const result = await tryAddIcon(userId, box.optionAId, allowOverflow);

  const updated = await prisma.iconBox.update({
    where: { id: boxId },
    data: {
      chosenOptionId: result.chosenId,
      status: result.status,
    },
  });

  const nextAll = all.map((b) =>
    b.id === boxId ? { status: result.status } : { status: b.status }
  );
  await afterDecision(userId, box.season, box.kind, nextAll);

  return updated;
}

/**
 * Gamble: abandon Option A in the source box and reveal Option B from a
 * different sealed box (irreversible).
 */
export async function gambleOptionB(
  sourceBoxId: string,
  targetBoxId: string,
  userId: string,
  allowOverflow: boolean
) {
  if (sourceBoxId === targetBoxId) {
    throw new Error("Pick a different box for the gamble");
  }

  const { box: source, all } = await userBoxes(userId, sourceBoxId);
  if (source.status !== "option_a_revealed") {
    throw new Error("Reveal Option A first");
  }

  const target = all.find((b) => b.id === targetBoxId);
  if (!target) throw new Error("Target box not found");
  if (target.status === "blocked") throw new Error("That box is locked");
  if (target.status !== "pending") throw new Error("Pick a sealed box");

  const result = await tryAddIcon(userId, target.optionBId, allowOverflow);

  await prisma.iconBox.update({
    where: { id: sourceBoxId },
    data: { status: "abandoned" },
  });

  const updated = await prisma.iconBox.update({
    where: { id: targetBoxId },
    data: {
      revealedOptionB: true,
      chosenOptionId: result.chosenId,
      status: result.status,
    },
  });

  await afterDecision(userId, source.season, source.kind, [
    ...all
      .filter((b) => b.id !== sourceBoxId && b.id !== targetBoxId)
      .map((b) => ({ status: b.status })),
    { status: "abandoned" },
    { status: result.status },
  ]);

  return updated;
}

/** Drop one squad player (to free agents) and claim the waiting icon. */
export async function replaceForIcon(params: {
  boxId: string;
  userId: string;
  releaseSquadPlayerId: string;
}) {
  const box = await prisma.iconBox.findUnique({ where: { id: params.boxId } });
  if (!box || box.userId !== params.userId) throw new Error("Box not found");
  if (box.status !== "awaiting_replacement" || !box.chosenOptionId) {
    throw new Error("No icon waiting for a squad slot");
  }

  const release = await prisma.squadPlayer.findFirst({
    where: { id: params.releaseSquadPlayerId, userId: params.userId },
    include: { player: true },
  });
  if (!release) throw new Error("Squad player not found");

  await prisma.squadPlayer.delete({ where: { id: release.id } });
  await prisma.player.update({
    where: { id: release.playerId },
    data: { status: "released" },
  });

  const chosenId = await takeIconIntoSquad(params.userId, box.chosenOptionId);

  await prisma.iconBox.update({
    where: { id: box.id },
    data: { chosenOptionId: chosenId, status: "completed" },
  });

  return { released: release.player.name };
}
