import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const session = await getSession();
  const code = params.code.toUpperCase();

  if (!session.userId || session.roomCode !== code) {
    return apiError("Not authenticated for this room", 401);
  }

  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      users: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          displayName: true,
          teamName: true,
          isAdmin: true,
          budget: true,
          createdAt: true,
        },
      },
    },
  });

  if (!room) {
    return apiError("Room not found", 404);
  }

  const currentUser = room.users.find((u) => u.id === session.userId);

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      phase: room.phase,
      currentSeason: room.currentSeason,
      userCount: room.users.length,
    },
    users: room.users,
    currentUser: currentUser
      ? {
          id: currentUser.id,
          displayName: currentUser.displayName,
          teamName: currentUser.teamName,
          isAdmin: currentUser.isAdmin,
          budget: currentUser.budget,
        }
      : null,
  });
}
