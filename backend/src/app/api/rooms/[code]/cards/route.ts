import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CARD_BY_KEY } from "@/lib/cards/types";
import { useCard } from "@/lib/cards/useCard";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";
import { formatBoostedStats, parseBoostedStats } from "@/lib/players/faceStats";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return apiError("User not found", 401);

    const cards = await prisma.card.findMany({
      where: { roomId: room.id, ownerId: session.userId },
      orderBy: [{ used: "asc" }, { createdAt: "desc" }],
    });

    const auctions = await prisma.auction.findMany({
      where: { roomId: room.id, status: "active" },
      include: { player: true },
      orderBy: { endsAt: "asc" },
    });

    const users = await prisma.user.findMany({
      where: { roomId: room.id },
      select: { id: true, teamName: true, displayName: true },
      orderBy: { teamName: "asc" },
    });

    const squad = await prisma.squadPlayer.findMany({
      where: { userId: session.userId },
      include: { player: true },
    });

    const availablePlayers = await prisma.player.findMany({
      where: { roomId: room.id, status: "available", isIcon: false, isHero: false },
      orderBy: { baseRating: "desc" },
      take: 80,
      select: {
        id: true,
        name: true,
        position: true,
        baseRating: true,
        realTeam: true,
      },
    });

    const myMatches = await prisma.match.findMany({
      where: {
        roomId: room.id,
        season: room.currentSeason,
        status: { in: ["scheduled", "pending_confirmation"] },
        OR: [{ homeUserId: session.userId }, { awayUserId: session.userId }],
      },
      include: {
        homeUser: { select: { teamName: true } },
        awayUser: { select: { teamName: true } },
      },
    });

    return apiSuccess({
      room: { code: room.code, name: room.name, phase: room.phase },
      user: {
        id: user.id,
        teamName: user.teamName,
        budget: user.budget,
        isAdmin: user.isAdmin,
      },
      cards: cards.map((c) => {
        const def = CARD_BY_KEY[c.type];
        return {
          id: c.id,
          type: c.type,
          category: (c as { category?: string }).category || def?.category || "transfer",
          used: c.used,
          name: def?.name ?? c.type,
          description: def?.description ?? "",
          rarity: def?.rarity ?? "common",
          target: def?.target ?? "none",
          metadata: c.metadata,
        };
      }),
      targets: {
        auctions: auctions.map((a) => ({
          id: a.id,
          label: `${a.player.name} · ${a.currentBid / 1_000_000}M`,
          isResale: a.isResale,
          sellerId: a.sellerId,
          currentBidderId: a.currentBidderId,
        })),
        matches: myMatches.map((m) => ({
          id: m.id,
          label: `${m.homeUser.teamName} vs ${m.awayUser.teamName}`,
        })),
        users: users.filter((u) => u.id !== session.userId),
        squad: squad.map((s) => {
          const rating = s.player.boostedRating ?? s.player.baseRating;
          const boosted =
            s.player.boostedRating != null &&
            s.player.boostedRating > s.player.baseRating;
          const statsLabel = formatBoostedStats(parseBoostedStats(s.player.boostedStats));
          return {
            id: s.playerId,
            squadPlayerId: s.id,
            label: boosted && statsLabel
              ? `${s.player.name} (${s.player.position} ${rating} · ${statsLabel})`
              : `${s.player.name} (${s.player.position} ${rating})`,
            boosted,
            boostedStats: parseBoostedStats(s.player.boostedStats),
          };
        }),
        availablePlayers,
      },
    });
  } catch (err) {
    console.error("Cards GET error:", err);
    return apiError("Failed to load cards", 500);
  }
}

const useSchema = z.object({
  cardId: z.string(),
  auctionId: z.string().optional(),
  playerId: z.string().optional(),
  targetUserId: z.string().optional(),
  ownPlayerId: z.string().optional(),
  matchId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const body = await request.json();
    const data = useSchema.parse(body);

    const result = await useCard({
      cardId: data.cardId,
      userId: session.userId,
      roomId: room.id,
      roomCode: code,
      auctionId: data.auctionId,
      playerId: data.playerId,
      targetUserId: data.targetUserId,
      ownPlayerId: data.ownPlayerId,
      matchId: data.matchId,
    });

    await emitToRoom(code, "card:used", {
      userId: session.userId,
      type: result.type ?? result.name,
    });
    await emitToRoom(code, "squad:updated", { userId: session.userId });

    return apiSuccess({ result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Use card error:", err);
    return apiError(err instanceof Error ? err.message : "Failed to use card", 400);
  }
}
