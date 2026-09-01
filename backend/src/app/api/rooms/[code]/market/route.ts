import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAvailableBudget, getCommittedBudget, getSquadCount } from "@/lib/auction/budget";
import { SQUAD_LIMIT } from "@/lib/auction/constants";
import { getCatalogFilterOptions } from "@/lib/players/catalog-filters";
import { ensureFullCatalog, getLeagueLookup } from "@/lib/players/seed";
import { getActiveEffects, getBlacklists } from "@/lib/cards/effects";
import { apiError, apiSuccess } from "@/lib/api";

const PLAYER_SELECT = {
  id: true,
  name: true,
  realTeam: true,
  league: true,
  position: true,
  baseRating: true,
  marketValue: true,
} as const;

/** Attach league from catalog in-memory (no heavy DB writes on each request) */
function withCatalogLeagues<T extends { name: string; realTeam: string; league?: string | null }>(
  players: T[]
): T[] {
  const needsLookup = players.some((p) => !p.league);
  if (!needsLookup) return players;

  const byKey = getLeagueLookup();
  return players.map((p) => {
    if (p.league) return p;
    const league = byKey.get(`${p.name.toLowerCase()}|${p.realTeam.toLowerCase()}`) ?? null;
    return { ...p, league };
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true },
    });

    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    await ensureFullCatalog(room.id);

    const [availablePlayersRaw, activeAuctions, user, availableBudget, committedBudget, squadCount] =
      await Promise.all([
        prisma.player.findMany({
          where: { roomId: room.id, status: "available", isIcon: false, isHero: false },
          select: PLAYER_SELECT,
          orderBy: [{ baseRating: "desc" }, { name: "asc" }],
        }),
        prisma.auction.findMany({
          where: { roomId: room.id, status: "active" },
          include: {
            player: { select: PLAYER_SELECT },
          },
          orderBy: { endsAt: "asc" },
        }),
        prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            id: true,
            displayName: true,
            teamName: true,
            budget: true,
            isAdmin: true,
          },
        }),
        getAvailableBudget(session.userId),
        getCommittedBudget(session.userId),
        getSquadCount(session.userId),
      ]);

    let hidden = new Set<string>();
    try {
      const effects = await getActiveEffects(room.id);
      hidden = new Set(
        getBlacklists(effects, session.userId)
          .map((e) => e.playerId)
          .filter(Boolean) as string[]
      );
    } catch (effectErr) {
      console.warn("Market effects skipped:", effectErr);
    }

    const availablePlayers = withCatalogLeagues(
      availablePlayersRaw.filter((p) => !hidden.has(p.id))
    );

    const bidderIds = activeAuctions
      .map((a) => a.currentBidderId)
      .filter(Boolean) as string[];

    const bidders =
      bidderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: bidderIds } },
            select: { id: true, displayName: true, teamName: true },
          })
        : [];

    const bidderMap = Object.fromEntries(bidders.map((b) => [b.id, b]));
    const catalog = getCatalogFilterOptions(true);

    const myBidAgg = await prisma.bid.groupBy({
      by: ["auctionId"],
      where: {
        userId: session.userId,
        auction: { roomId: room.id, status: "active" },
      },
      _max: { amount: true },
    });
    const myHighestBidByAuction = Object.fromEntries(
      myBidAgg.map((row) => [row.auctionId, row._max.amount ?? 0])
    );

    return apiSuccess({
      room: {
        code: room.code,
        name: room.name,
        phase: room.phase,
      },
      settings: {
        bidTimerSeconds: room.settings?.bidTimerSeconds ?? 60,
        deadlineBidTimerSeconds: room.settings?.deadlineBidTimerSeconds ?? 20,
        deadlineDayEnabled: room.settings?.deadlineDayEnabled ?? true,
        deadlineStartsAt: room.settings?.deadlineStartsAt?.toISOString() ?? null,
        deadlineEndsAt: room.settings?.deadlineEndsAt?.toISOString() ?? null,
        transferWindowEndsAt: room.settings?.transferWindowEndsAt?.toISOString() ?? null,
        marketLocked: room.settings?.transferWindowEndsAt
          ? room.settings.transferWindowEndsAt.getTime() <= Date.now()
          : false,
      },
      user: {
        id: session.userId,
        displayName: user?.displayName,
        teamName: user?.teamName,
        budget: user?.budget ?? 0,
        availableBudget,
        committedBudget,
        squadCount,
        squadLimit: SQUAD_LIMIT,
        isAdmin: user?.isAdmin ?? false,
      },
      filterOptions: {
        leagues: catalog.leagues,
        teams: catalog.teams,
      },
      availablePlayers,
      activeAuctions: activeAuctions.map((a) => {
        const myHighestBid = myHighestBidByAuction[a.id] ?? null;
        const myBidStatus = myHighestBid
          ? a.currentBidderId === session.userId
            ? ("winning" as const)
            : ("outbid" as const)
          : null;

        return {
          id: a.id,
          playerId: a.playerId,
          player: a.player,
          startingPrice: a.startingPrice,
          currentBid: a.currentBid,
          currentBidderId: a.currentBidderId,
          currentBidder: a.currentBidderId ? bidderMap[a.currentBidderId] : null,
          sellerId: a.sellerId,
          endsAt: a.endsAt.toISOString(),
          isResale: a.isResale,
          myHighestBid,
          myBidStatus,
        };
      }),
    });
  } catch (err) {
    console.error("Market API error:", err);
    const message = err instanceof Error ? err.message : "Failed to load market";
    return apiError(message || "Failed to load market", 500);
  }
}
