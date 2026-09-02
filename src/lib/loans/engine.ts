import { prisma } from "@/lib/prisma";
import { SQUAD_LIMIT } from "@/lib/auction/constants";
import { getCommittedBudget } from "@/lib/auction/budget";

export const MIN_LOAN_FIXTURES = 1;
export const MAX_LOAN_FIXTURES = 5;

export type LoanValidation = { ok: true } | { ok: false; reason: string };

export async function getActiveLoanForPlayer(playerId: string) {
  return prisma.loan.findFirst({
    where: { playerId, status: "active" },
  });
}

export async function getLoanedOutPlayerIds(lenderId: string): Promise<Set<string>> {
  const rows = await prisma.loan.findMany({
    where: { lenderId, status: "active" },
    select: { playerId: true },
  });
  return new Set(rows.map((r) => r.playerId));
}

export async function getEffectiveSquadCount(userId: string): Promise<number> {
  const [owned, loanedOut, loanedIn] = await Promise.all([
    prisma.squadPlayer.count({ where: { userId } }),
    prisma.loan.count({
      where: { lenderId: userId, status: "active" },
    }),
    prisma.loan.count({
      where: { borrowerId: userId, status: "active" },
    }),
  ]);
  return owned - loanedOut + loanedIn;
}

async function playerInAuction(playerId: string): Promise<boolean> {
  const active = await prisma.auction.findFirst({
    where: { playerId, status: "active" },
    select: { id: true },
  });
  return Boolean(active);
}

export async function validateLoanProposal(params: {
  lenderId: string;
  borrowerId: string;
  playerId: string;
  loanFee: number;
  fixturesTotal: number;
}): Promise<LoanValidation> {
  const { lenderId, borrowerId, playerId, loanFee, fixturesTotal } = params;

  if (lenderId === borrowerId) {
    return { ok: false, reason: "Cannot loan a player to yourself" };
  }

  if (fixturesTotal < MIN_LOAN_FIXTURES || fixturesTotal > MAX_LOAN_FIXTURES) {
    return {
      ok: false,
      reason: `Loan length must be ${MIN_LOAN_FIXTURES}–${MAX_LOAN_FIXTURES} fixtures`,
    };
  }

  if (loanFee < 0) {
    return { ok: false, reason: "Loan fee cannot be negative" };
  }

  const entry = await prisma.squadPlayer.findUnique({
    where: { playerId },
    include: { player: true },
  });
  if (!entry || entry.userId !== lenderId) {
    return { ok: false, reason: "You do not own this player" };
  }
  if (entry.player.isIcon || entry.player.isHero) {
    return { ok: false, reason: "Icons and heroes cannot be loaned" };
  }

  const existing = await getActiveLoanForPlayer(playerId);
  if (existing) {
    return { ok: false, reason: "This player is already on loan" };
  }

  const pending = await prisma.loan.findFirst({
    where: { playerId, status: "pending" },
  });
  if (pending) {
    return { ok: false, reason: "This player already has a pending loan offer" };
  }

  if (await playerInAuction(playerId)) {
    return { ok: false, reason: "Player is currently in an auction" };
  }

  const borrowerCount = await getEffectiveSquadCount(borrowerId);
  if (borrowerCount >= SQUAD_LIMIT) {
    return { ok: false, reason: `Borrower's squad is full (${SQUAD_LIMIT})` };
  }

  if (loanFee > 0) {
    const borrower = await prisma.user.findUnique({
      where: { id: borrowerId },
      select: { budget: true },
    });
    if (!borrower) return { ok: false, reason: "Borrower not found" };
    const committed = await getCommittedBudget(borrowerId);
    const available = borrower.budget - committed;
    if (available < loanFee) {
      return { ok: false, reason: "Borrower cannot afford the loan fee" };
    }
  }

  return { ok: true };
}

export async function executeLoan(loanId: string): Promise<void> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan || loan.status !== "pending") {
    throw new Error("Loan is not pending");
  }

  const check = await validateLoanProposal({
    lenderId: loan.lenderId,
    borrowerId: loan.borrowerId,
    playerId: loan.playerId,
    loanFee: loan.loanFee,
    fixturesTotal: loan.fixturesTotal,
  });
  if (!check.ok) throw new Error(check.reason);

  await prisma.$transaction(async (tx) => {
    if (loan.loanFee > 0) {
      await tx.user.update({
        where: { id: loan.borrowerId },
        data: { budget: { decrement: loan.loanFee } },
      });
      await tx.user.update({
        where: { id: loan.lenderId },
        data: { budget: { increment: loan.loanFee } },
      });
    }

    await tx.squadPlayer.updateMany({
      where: { playerId: loan.playerId, userId: loan.lenderId },
      data: { isStarting: false },
    });

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        status: "active",
        acceptedAt: new Date(),
        fixturesPlayed: 0,
      },
    });
  });
}

export async function returnLoan(loanId: string): Promise<void> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan || loan.status !== "active") return;

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      status: "returned",
      returnedAt: new Date(),
    },
  });
}

/** Decrement fixture counters when a borrower plays a confirmed match. */
export async function processLoanFixtureTicks(
  roomId: string,
  userIds: string[]
): Promise<string[]> {
  const active = await prisma.loan.findMany({
    where: {
      roomId,
      status: "active",
      borrowerId: { in: userIds },
    },
  });

  const returnedLoanIds: string[] = [];

  for (const loan of active) {
    const played = loan.fixturesPlayed + 1;
    if (played >= loan.fixturesTotal) {
      await returnLoan(loan.id);
      returnedLoanIds.push(loan.id);
    } else {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { fixturesPlayed: played },
      });
    }
  }

  return returnedLoanIds;
}

export async function returnAllActiveLoans(roomId: string): Promise<number> {
  const active = await prisma.loan.findMany({
    where: { roomId, status: "active" },
    select: { id: true },
  });
  for (const loan of active) {
    await returnLoan(loan.id);
  }
  return active.length;
}
