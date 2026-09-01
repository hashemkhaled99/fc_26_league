import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

export async function requireRoomAdmin(code: string) {
  const session = await getSession();
  if (!session.userId) return { ok: false as const, response: apiError("Not authenticated", 401) };

  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    include: { settings: true },
  });
  if (!room) return { ok: false as const, response: apiError("Room not found") };
  if (room.id !== session.roomId) return { ok: false as const, response: apiError("Wrong room") };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.isAdmin) return { ok: false as const, response: apiError("Admin only", 403) };

  return { ok: true as const, session, room, user };
}
