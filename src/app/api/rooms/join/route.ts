import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { apiError, apiSuccess } from "@/lib/api";

const joinSchema = z.object({
  code: z.string().min(6).max(12),
  displayName: z.string().min(2).max(30),
  teamName: z.string().min(2).max(40),
  pin: z.string().min(4).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = joinSchema.parse(body);
    const code = data.code.toUpperCase().trim();

    const room = await prisma.room.findUnique({
      where: { code },
      include: { settings: true, users: true },
    });

    if (!room) {
      return apiError("Room not found. Check your code.");
    }

    if (room.phase !== "lobby" && room.phase !== "bidding") {
      return apiError("This room is no longer accepting new players.");
    }

    const userCount = room.users.length;
    if (userCount >= 20) {
      return apiError("Room is full (max 20 players).");
    }

    const nameTaken = room.users.some(
      (u) => u.displayName.toLowerCase() === data.displayName.toLowerCase()
    );
    if (nameTaken) {
      return apiError("Display name already taken in this room.");
    }

    const teamTaken = room.users.some(
      (u) => u.teamName.toLowerCase() === data.teamName.toLowerCase()
    );
    if (teamTaken) {
      return apiError("Team name already taken in this room.");
    }

    const budget = room.settings?.startingBudget ?? 400000000;

    const user = await prisma.user.create({
      data: {
        roomId: room.id,
        displayName: data.displayName,
        teamName: data.teamName,
        pin: data.pin ?? null,
        isAdmin: false,
        budget,
      },
    });

    const session = await getSession();
    session.userId = user.id;
    session.roomId = room.id;
    session.roomCode = room.code;
    session.displayName = user.displayName;
    session.teamName = user.teamName;
    session.isAdmin = false;
    await session.save();

    return apiSuccess({
      code: room.code,
      roomId: room.id,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Join room error:", err);
    return apiError("Failed to join room", 500);
  }
}
