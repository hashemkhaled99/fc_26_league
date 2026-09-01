import { prisma } from "@/lib/prisma";
import { ICON_CATALOG, iconMarketValue } from "./pool";
import { HERO_CATALOG } from "./heroes";
import { MAX_OPENABLE_BOXES } from "./constants";

export type PackKind = "icon" | "hero";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function ensureIconPool(roomId: string) {
  const existing = await prisma.player.count({
    where: { roomId, isIcon: true, isHero: false, status: "icon_pool" },
  });
  if (existing >= 16) return;

  const already = await prisma.player.findMany({
    where: { roomId, isIcon: true },
    select: { name: true },
  });
  const names = new Set(already.map((p) => p.name));
  const toCreate = ICON_CATALOG.filter((i) => !names.has(i.name));
  if (toCreate.length === 0) return;

  await prisma.player.createMany({
    data: toCreate.map((i) => ({
      roomId,
      name: i.name,
      realTeam: i.realTeam,
      league: "Icons",
      position: i.position === "CF" ? "ST" : i.position,
      baseRating: i.baseRating,
      marketValue: iconMarketValue(i.baseRating),
      status: "icon_pool",
      isIcon: true,
      isHero: false,
    })),
  });
}

export async function ensureHeroPool(roomId: string) {
  const existing = await prisma.player.count({
    where: { roomId, isHero: true, status: "hero_pool" },
  });
  if (existing >= 16) return;

  const already = await prisma.player.findMany({
    where: { roomId, isHero: true },
    select: { name: true },
  });
  const names = new Set(already.map((p) => p.name));
  const toCreate = HERO_CATALOG.filter((i) => !names.has(i.name));
  if (toCreate.length === 0) return;

  await prisma.player.createMany({
    data: toCreate.map((i) => ({
      roomId,
      name: i.name,
      realTeam: i.realTeam,
      league: "Heroes",
      position: i.position === "CF" ? "ST" : i.position,
      baseRating: i.baseRating,
      marketValue: iconMarketValue(i.baseRating),
      status: "hero_pool",
      isIcon: false,
      isHero: true,
    })),
  });
}

const BOXES_PER_USER = 4;

export async function generatePackBoxes(
  roomId: string,
  season: number,
  kind: PackKind
) {
  if (kind === "icon") await ensureIconPool(roomId);
  else await ensureHeroPool(roomId);

  const existing = await prisma.iconBox.count({
    where: { roomId, season, kind },
  });
  if (existing > 0) {
    throw new Error(
      `${kind === "icon" ? "Icon" : "Hero"} boxes already generated for this season`
    );
  }

  const users = await prisma.user.findMany({ where: { roomId }, select: { id: true } });
  const pool = await prisma.player.findMany({
    where:
      kind === "icon"
        ? { roomId, isIcon: true, status: "icon_pool" }
        : { roomId, isHero: true, status: "hero_pool" },
    select: { id: true },
  });

  if (pool.length < 16) {
    throw new Error(`Not enough ${kind} players in the pool`);
  }

  const boxes: Array<{
    roomId: string;
    userId: string;
    season: number;
    kind: string;
    boxNumber: number;
    optionAId: string;
    optionBId: string;
    status: string;
  }> = [];

  for (const user of users) {
    for (let n = 1; n <= BOXES_PER_USER; n++) {
      const picks = shuffle(pool).slice(0, 2);
      let a = picks[0];
      let b = picks[1];
      if (!a || !b || a.id === b.id) {
        const i = Math.floor(Math.random() * pool.length);
        let j = Math.floor(Math.random() * pool.length);
        while (j === i) j = Math.floor(Math.random() * pool.length);
        a = pool[i];
        b = pool[j];
      }
      boxes.push({
        roomId,
        userId: user.id,
        season,
        kind,
        boxNumber: n,
        optionAId: a.id,
        optionBId: b.id,
        status: "pending",
      });
    }
  }

  await prisma.iconBox.createMany({ data: boxes });
  return { users: users.length, boxes: boxes.length, kind };
}

export async function generateIconBoxes(roomId: string, season: number) {
  return generatePackBoxes(roomId, season, "icon");
}

export async function generateHeroBoxes(roomId: string, season: number) {
  return generatePackBoxes(roomId, season, "hero");
}

export async function packBoxProgress(
  roomId: string,
  season: number,
  kind: PackKind
) {
  const users = await prisma.user.findMany({
    where: { roomId },
    select: { id: true, teamName: true, displayName: true },
    orderBy: { teamName: "asc" },
  });

  const boxes = await prisma.iconBox.findMany({
    where: { roomId, season, kind },
    select: { userId: true, status: true, boxNumber: true },
  });

  const byUser = new Map<string, typeof boxes>();
  for (const b of boxes) {
    const list = byUser.get(b.userId) ?? [];
    list.push(b);
    byUser.set(b.userId, list);
  }

  const checklist = users.map((u) => {
    const ub = byUser.get(u.id) ?? [];
    const claimed = ub.filter(
      (b) => b.status === "completed" || b.status === "awaiting_replacement"
    ).length;
    const resolved = ub.filter((b) =>
      ["completed", "awaiting_replacement", "abandoned"].includes(b.status)
    ).length;
    const pendingDecision = ub.some((b) => b.status === "option_a_revealed");
    return {
      userId: u.id,
      teamName: u.teamName,
      displayName: u.displayName,
      total: MAX_OPENABLE_BOXES,
      completed: claimed,
      awaitingReplacement: ub.filter((b) => b.status === "awaiting_replacement").length,
      ready:
        ub.length > 0 &&
        !pendingDecision &&
        resolved >= MAX_OPENABLE_BOXES,
    };
  });

  const generated = boxes.length > 0;
  const allReady = generated && checklist.every((c) => c.ready);

  return { generated, allReady, checklist, kind };
}

export async function iconBoxProgress(roomId: string, season: number) {
  return packBoxProgress(roomId, season, "icon");
}

export async function heroBoxProgress(roomId: string, season: number) {
  return packBoxProgress(roomId, season, "hero");
}
