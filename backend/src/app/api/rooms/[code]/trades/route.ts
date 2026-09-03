import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { validateTrade } from "@/lib/trades/engine";
import { isMarketLocked } from "@/lib/auction/close";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

async function assertTradingAllowed(roomId: string, phase: string) {
  const settings = await prisma.roomSettings.findUnique({ where: { roomId } });
  if (phase === "trade_window") return true;
  if (isMarketLocked(settings)) return false;
  if (phase === "bidding") return true;
  if (phase === "league") {
    return Boolean(settings?.tradingEnabledDuringLeague);
  }
  return false;
}

function mapTrade(
  t: {
    id: string;
    fromUserId: string;
    toUserId: string;
    offeredPlayerIds: string[];
    requestedPlayerIds: string[];
    cashAdjustment: number;
    status: string;
    createdAt: Date;
  },
  users: Map<string, { id: string; displayName: string; teamName: string }>,
  players: Map<
    string,
    { id: string; name: string; position: string; baseRating: number; realTeam: string }
  >
) {
  return {
    id: t.id,
    fromUserId: t.fromUserId,
    toUserId: t.toUserId,
    fromUser: users.get(t.fromUserId) ?? null,
    toUser: users.get(t.toUserId) ?? null,
    offeredPlayers: t.offeredPlayerIds.map((id) => players.get(id)).filter(Boolean),
    requestedPlayers: t.requestedPlayerIds.map((id) => players.get(id)).filter(Boolean),
    offeredPlayerIds: t.offeredPlayerIds,
    requestedPlayerIds: t.requestedPlayerIds,
    cashAdjustment: t.cashAdjustment,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  };
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
      include: {
        users: {
          select: {
            id: true,
            displayName: true,
            teamName: true,
            budget: true,
            isAdmin: true,
          },
          orderBy: { teamName: "asc" },
        },
        settings: true,
      },
    });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const me = room.users.find((u) => u.id === session.userId);
    if (!me) return apiError("Not in room", 401);

    const trades = await prisma.tradeRequest.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const playerIds = [
      ...new Set(trades.flatMap((t) => [...t.offeredPlayerIds, ...t.requestedPlayerIds])),
    ];
    const playerRows =
      playerIds.length > 0
        ? await prisma.player.findMany({
            where: { id: { in: playerIds } },
            select: {
              id: true,
              name: true,
              position: true,
              baseRating: true,
              realTeam: true,
            },
          })
        : [];

    const userMap = new Map(room.users.map((u) => [u.id, u]));
    const playerMap = new Map(playerRows.map((p) => [p.id, p]));

    const mapped = trades.map((t) => mapTrade(t, userMap, playerMap));

    const mySquad = await prisma.squadPlayer.findMany({
      where: { userId: session.userId },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            baseRating: true,
            realTeam: true,
          },
        },
      },
      orderBy: { player: { baseRating: "desc" } },
    });

    const otherUsers = room.users.filter((u) => u.id !== session.userId);

    return apiSuccess({
      room: { code: room.code, name: room.name, phase: room.phase },
      user: {
        id: me.id,
        displayName: me.displayName,
        teamName: me.teamName,
        budget: me.budget,
        isAdmin: me.isAdmin,
      },
      tradingAllowed: await assertTradingAllowed(room.id, room.phase),
      tradingEnabledDuringLeague: room.settings?.tradingEnabledDuringLeague ?? false,
      partners: otherUsers,
      mySquad: mySquad.map((s) => ({
        squadPlayerId: s.id,
        purchasePrice: s.purchasePrice,
        ...s.player,
      })),
      incoming: mapped.filter((t) => t.toUserId === session.userId && t.status === "pending"),
      outgoing: mapped.filter((t) => t.fromUserId === session.userId && t.status === "pending"),
      history: mapped.filter((t) => t.status !== "pending"),
    });
  } catch (err) {
    console.error("Trades GET error:", err);
    return apiError("Failed to load trades", 500);
  }
}

const createSchema = z.object({
  toUserId: z.string(),
  offeredPlayerIds: z.array(z.string()).default([]),
  requestedPlayerIds: z.array(z.string()).default([]),
  cashAdjustment: z.number().int().default(0),
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

    if (!(await assertTradingAllowed(room.id, room.phase))) {
      return apiError("Trading is not open right now");
    }

    const body = await request.json();
    const data = createSchema.parse(body);

    const partner = await prisma.user.findFirst({
      where: { id: data.toUserId, roomId: room.id },
    });
    if (!partner) return apiError("Partner not found in this room");

    const check = await validateTrade({
      fromUserId: session.userId,
      toUserId: data.toUserId,
      offeredPlayerIds: data.offeredPlayerIds,
      requestedPlayerIds: data.requestedPlayerIds,
      cashAdjustment: data.cashAdjustment,
    });
    if (!check.ok) return apiError(check.reason);

    const trade = await prisma.tradeRequest.create({
      data: {
        roomId: room.id,
        fromUserId: session.userId,
        toUserId: data.toUserId,
        offeredPlayerIds: data.offeredPlayerIds,
        requestedPlayerIds: data.requestedPlayerIds,
        cashAdjustment: data.cashAdjustment,
        status: "pending",
      },
    });

    await emitToRoom(code, "trade:requested", {
      tradeId: trade.id,
      toUserId: data.toUserId,
      fromUserId: session.userId,
    });

    return apiSuccess({ tradeId: trade.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Create trade error:", err);
    return apiError("Failed to create trade", 500);
  }
}
