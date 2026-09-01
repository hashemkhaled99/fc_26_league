import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

/** Recent closed deals for the deadline ticker */
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

    const closed = await prisma.auction.findMany({
      where: { roomId: room.id, status: "closed" },
      include: { player: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const userIds = [
      ...new Set(
        closed
          .flatMap((a) => [a.currentBidderId, a.sellerId])
          .filter(Boolean) as string[]
      ),
    ];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, teamName: true, displayName: true },
          })
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const deals = closed.map((a) => {
      const winner = a.currentBidderId ? userMap[a.currentBidderId] : null;
      const seller = a.sellerId ? userMap[a.sellerId] : null;
      const line = a.isResale && seller
        ? `🔥 ${winner?.teamName ?? "Someone"} signed ${a.player.name} for ${formatMoney(a.currentBid)} from ${seller.teamName}`
        : `🔥 ${winner?.teamName ?? "Someone"} signed ${a.player.name} for ${formatMoney(a.currentBid)}`;
      return {
        id: a.id,
        line,
        playerName: a.player.name,
        price: a.currentBid,
        isResale: a.isResale,
        at: a.createdAt.toISOString(),
      };
    });

    return apiSuccess({ deals });
  } catch (err) {
    console.error("Deals error:", err);
    return apiError("Failed to load deals", 500);
  }
}
