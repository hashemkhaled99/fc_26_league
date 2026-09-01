import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { apiError, apiSuccess } from "@/lib/api";
import type { User } from "@prisma/client";

const newJoinSchema = z.object({
  mode: z.literal("new").optional(),
  code: z.string().min(6).max(12),
  displayName: z.string().min(2).max(30),
  teamName: z.string().min(2).max(40),
  pin: z.string().min(4).max(8).optional(),
});

const rejoinSchema = z.object({
  mode: z.literal("rejoin"),
  code: z.string().min(6).max(12),
  rejoinBy: z.enum(["displayName", "teamName"]),
  name: z.string().min(2).max(40),
  pin: z.string().min(4).max(8).optional(),
});

const joinSchema = z.union([newJoinSchema, rejoinSchema]);

async function saveUserSession(user: User, roomCode: string, roomId: string) {
  const session = await getSession();
  session.userId = user.id;
  session.roomId = roomId;
  session.roomCode = roomCode;
  session.displayName = user.displayName;
  session.teamName = user.teamName;
  session.isAdmin = user.isAdmin;
  await session.save();
}

function verifyPin(user: User, pin?: string) {
  if (!user.pin) return null;
  if (!pin || pin !== user.pin) {
    return "PIN required to re-join this account.";
  }
  return null;
}

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

    if (data.mode === "rejoin") {
      const field = data.rejoinBy;
      const needle = data.name.trim().toLowerCase();
      const existingUser = room.users.find((u) => u[field].toLowerCase() === needle);

      if (!existingUser) {
        const label = field === "displayName" ? "display name" : "team name";
        return apiError(`No player found with that ${label} in this room.`);
      }

      const pinError = verifyPin(existingUser, data.pin);
      if (pinError) return apiError(pinError);

      await saveUserSession(existingUser, room.code, room.id);

      return apiSuccess({
        code: room.code,
        roomId: room.id,
        userId: existingUser.id,
        rejoined: true,
        phase: room.phase,
      });
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
      return apiError(
        "Display name already taken. Use Re-join if you played in this room before."
      );
    }

    const teamTaken = room.users.some(
      (u) => u.teamName.toLowerCase() === data.teamName.toLowerCase()
    );
    if (teamTaken) {
      return apiError(
        "Team name already taken. Use Re-join if you played in this room before."
      );
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

    await saveUserSession(user, room.code, room.id);

    return apiSuccess({
      code: room.code,
      roomId: room.id,
      userId: user.id,
      rejoined: false,
      phase: room.phase,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Join room error:", err);
    return apiError("Failed to join room", 500);
  }
}
