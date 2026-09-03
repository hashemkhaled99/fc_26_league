import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateRoomCode } from "@/lib/utils";
import { apiError, apiSuccess } from "@/lib/api";
import { DEFAULT_SLOT_TEMPLATE, DEFAULT_TIER_WEIGHTS } from "@/lib/hero-draft";

const createSchema = z.object({
  roomName: z.string().min(2).max(50),
  displayName: z.string().min(2).max(30),
  teamName: z.string().min(2).max(40),
  pin: z.string().min(4).max(8).optional(),
  mode: z.enum(["FREE_MARKET", "HERO_DRAFT"]).default("FREE_MARKET"),
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

    const isHeroDraft = data.mode === "HERO_DRAFT";
    const startingBudget = isHeroDraft ? 500_000_000 : 400_000_000;

    const room = await prisma.room.create({
      data: {
        code,
        name: data.roomName,
        mode: data.mode,
        phase: "lobby",
        settings: {
          create: {
            startingBudget,
            enabledCardTypes: isHeroDraft
              ? []
              : [
                  "cash_injection",
                  "tax_refund",
                  "clone",
                  "free_icon",
                  "mystery_box",
                ],
          },
        },
        heroDraftSettings: isHeroDraft
          ? {
              create: {
                startingBudget,
              },
            }
          : undefined,
        heroDraftState: isHeroDraft
          ? {
              create: {
                status: "not_started",
                turnQueue: [],
                biddingOrder: [],
                slotTemplate: DEFAULT_SLOT_TEMPLATE,
                tierWeights: DEFAULT_TIER_WEIGHTS,
              },
            }
          : undefined,
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
      mode: room.mode,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Create room error:", err);
    return apiError("Failed to create room", 500);
  }
}
