import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const session = await getSession();
  const code = params.code.toUpperCase();

  if (!session.userId || session.roomCode !== code) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
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
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
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
