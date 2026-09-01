import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api";

export async function GET() {
  const session = await getSession();

  if (!session.userId) {
    return apiSuccess({ authenticated: false });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      room: { include: { settings: true } },
    },
  });

  if (!user) {
    session.destroy();
    return apiSuccess({ authenticated: false });
  }

  return apiSuccess({
    authenticated: true,
    user: {
      id: user.id,
      displayName: user.displayName,
      teamName: user.teamName,
      isAdmin: user.isAdmin,
      budget: user.budget,
    },
    room: {
      id: user.room.id,
      code: user.room.code,
      name: user.room.name,
      phase: user.room.phase,
      currentSeason: user.room.currentSeason,
    },
  });
}
