import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateRoomCode } from "@/lib/utils";
import { apiError, apiSuccess } from "@/lib/api";

const createSchema = z.object({
  roomName: z.string().min(2).max(50),
  displayName: z.string().min(2).max(30),
  teamName: z.string().min(2).max(40),
  pin: z.string().min(4).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    let code = generateRoomCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.room.findUnique({ where: { code } });
      if (!existing) break;
      code = generateRoomCode();
      attempts++;
    }

    const startingBudget = 400000000;

    const room = await prisma.room.create({
      data: {
        code,
        name: data.roomName,
        phase: "lobby",
        settings: {
          create: {
            startingBudget,
            enabledCardTypes: [
              "cash_injection",
              "tax_refund",
              "clone",
              "free_icon",
              "mystery_box",
            ],
          },
        },
        users: {
          create: {
            displayName: data.displayName,
            teamName: data.teamName,
            pin: data.pin ?? null,
            isAdmin: true,
            budget: startingBudget,
          },
        },
      },
      include: { users: true },
    });

    const user = room.users[0];
    const session = await getSession();
    session.userId = user.id;
    session.roomId = room.id;
    session.roomCode = room.code;
    session.displayName = user.displayName;
    session.teamName = user.teamName;
    session.isAdmin = true;
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
    console.error("Create room error:", err);
    return apiError("Failed to create room", 500);
  }
}
