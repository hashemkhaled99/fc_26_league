import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMarketLocked } from "@/lib/auction/close";
import {
  MAX_LOAN_FIXTURES,
  MIN_LOAN_FIXTURES,
  getLoanedOutPlayerIds,
  validateLoanProposal,
} from "@/lib/loans/engine";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

async function assertLoansAllowed(roomId: string, phase: string) {
  const settings = await prisma.roomSettings.findUnique({ where: { roomId } });
  if (isMarketLocked(settings)) return false;
  if (phase === "league") return true;
  if (phase === "bidding") return true;
  return false;
}

function mapLoan(
  l: {
    id: string;
    lenderId: string;
    borrowerId: string;
    playerId: string;
    loanFee: number;
    fixturesTotal: number;
    fixturesPlayed: number;
    status: string;
    createdAt: Date;
    acceptedAt: Date | null;
    returnedAt: Date | null;
  },
  users: Map<string, { id: string; displayName: string; teamName: string }>,
  players: Map<
    string,
    { id: string; name: string; position: string; baseRating: number; realTeam: string }
  >
) {
  const fixturesRemaining = Math.max(0, l.fixturesTotal - l.fixturesPlayed);
  return {
    id: l.id,
    lenderId: l.lenderId,
    borrowerId: l.borrowerId,
    playerId: l.playerId,
    lender: users.get(l.lenderId) ?? null,
    borrower: users.get(l.borrowerId) ?? null,
    player: players.get(l.playerId) ?? null,
    loanFee: l.loanFee,
    fixturesTotal: l.fixturesTotal,
    fixturesPlayed: l.fixturesPlayed,
    fixturesRemaining,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    acceptedAt: l.acceptedAt?.toISOString() ?? null,
    returnedAt: l.returnedAt?.toISOString() ?? null,
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
          select: { id: true, displayName: true, teamName: true, budget: true, isAdmin: true },
          orderBy: { teamName: "asc" },
        },
        settings: true,
      },
    });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const me = room.users.find((u) => u.id === session.userId);
    if (!me) return apiError("Not in room", 401);

    const loans = await prisma.loan.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const playerIds = [...new Set(loans.map((l) => l.playerId))];
    const players =
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

    const loanedOut = await getLoanedOutPlayerIds(session.userId);
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
            isIcon: true,
            isHero: true,
          },
        },
      },
      orderBy: { player: { baseRating: "desc" } },
    });

    const userMap = new Map(room.users.map((u) => [u.id, u]));
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const mapped = loans.map((l) => mapLoan(l, userMap, playerMap));

    return apiSuccess({
      room: { code: room.code, name: room.name, phase: room.phase, season: room.currentSeason },
      user: {
        id: me.id,
        displayName: me.displayName,
        teamName: me.teamName,
        budget: me.budget,
        isAdmin: me.isAdmin,
      },
      loansAllowed: await assertLoansAllowed(room.id, room.phase),
      minFixtures: MIN_LOAN_FIXTURES,
      maxFixtures: MAX_LOAN_FIXTURES,
      partners: room.users.filter((u) => u.id !== session.userId),
      mySquad: mySquad
        .filter((s) => !s.player.isIcon && !s.player.isHero && !loanedOut.has(s.player.id))
        .map((s) => ({
          squadPlayerId: s.id,
          ...s.player,
        })),
      incoming: mapped.filter((l) => l.borrowerId === session.userId && l.status === "pending"),
      outgoing: mapped.filter((l) => l.lenderId === session.userId && l.status === "pending"),
      active: mapped.filter(
        (l) =>
          l.status === "active" &&
          (l.lenderId === session.userId || l.borrowerId === session.userId)
      ),
      history: mapped.filter(
        (l) =>
          l.status !== "pending" &&
          l.status !== "active" &&
          (l.lenderId === session.userId || l.borrowerId === session.userId)
      ),
    });
  } catch (err) {
    console.error("Loans GET error:", err);
    return apiError("Failed to load loans", 500);
  }
}

const createSchema = z.object({
  borrowerId: z.string(),
  playerId: z.string(),
  loanFee: z.number().int().min(0).default(0),
  fixturesTotal: z.number().int().min(MIN_LOAN_FIXTURES).max(MAX_LOAN_FIXTURES),
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

    if (!(await assertLoansAllowed(room.id, room.phase))) {
      return apiError("Loans are not open right now");
    }

    const body = await request.json();
    const data = createSchema.parse(body);

    const borrower = await prisma.user.findFirst({
      where: { id: data.borrowerId, roomId: room.id },
    });
    if (!borrower) return apiError("Borrower not found in this room");

    const check = await validateLoanProposal({
      lenderId: session.userId,
      borrowerId: data.borrowerId,
      playerId: data.playerId,
      loanFee: data.loanFee,
      fixturesTotal: data.fixturesTotal,
    });
    if (!check.ok) return apiError(check.reason);

    const loan = await prisma.loan.create({
      data: {
        roomId: room.id,
        season: room.currentSeason,
        lenderId: session.userId,
        borrowerId: data.borrowerId,
        playerId: data.playerId,
        loanFee: data.loanFee,
        fixturesTotal: data.fixturesTotal,
        status: "pending",
      },
    });

    await emitToRoom(code, "loan:requested", {
      loanId: loan.id,
      borrowerId: data.borrowerId,
      lenderId: session.userId,
    });

    return apiSuccess({ loanId: loan.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Create loan error:", err);
    return apiError("Failed to create loan", 500);
  }
}
