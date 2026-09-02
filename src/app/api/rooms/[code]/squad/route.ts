import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MAX_STARTERS, SQUAD_LIMIT } from "@/lib/auction/constants";
import { apiError, apiSuccess } from "@/lib/api";
import { ensureBoostedStats, parseBoostedStats } from "@/lib/players/faceStats";
import { getLoanedOutPlayerIds } from "@/lib/loans/engine";

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
      select: { id: true, code: true, name: true, phase: true },
    });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const [user, squad, loanedOutIds, borrowedLoans] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          displayName: true,
          teamName: true,
          budget: true,
          isAdmin: true,
        },
      }),
      prisma.squadPlayer.findMany({
        where: { userId: session.userId },
        include: { player: true },
        orderBy: [{ isStarting: "desc" }, { player: { baseRating: "desc" } }],
      }),
      getLoanedOutPlayerIds(session.userId),
      prisma.loan.findMany({
        where: { borrowerId: session.userId, status: "active" },
        include: { player: true },
      }),
    ]);

    if (!user) return apiError("User not found", 401);

    // Compute face-stat backfill in memory only — never write on GET (pool pressure).
    const enriched = squad.map((s) => {
      const player = s.player;
      const hasOvrBoost =
        player.boostedRating != null && player.boostedRating > player.baseRating;
      const existing = parseBoostedStats(player.boostedStats);
      if (!hasOvrBoost || existing.length > 0) {
        return {
          ...s,
          player: {
            ...player,
            boostedStats: existing.length > 0 ? existing : player.boostedStats,
          },
        };
      }

      const stats = ensureBoostedStats(
        player.position,
        player.baseRating,
        player.boostedRating,
        player.boostedStats
      );
      if (stats.length === 0) return s;
      return {
        ...s,
        player: { ...player, boostedStats: stats },
      };
    });

    const borrowedEntries = borrowedLoans.map((loan) => ({
      id: `loan-${loan.id}`,
      loanId: loan.id,
      isStarting: loan.borrowerIsStarting,
      purchasePrice: 0,
      isLoanedIn: true,
      isLoanedOut: false,
      loanFixturesRemaining: Math.max(0, loan.fixturesTotal - loan.fixturesPlayed),
      player: loan.player,
    }));

    const ownedMapped = enriched.map((s) => ({
      id: s.id,
      loanId: null as string | null,
      isStarting: loanedOutIds.has(s.player.id) ? false : s.isStarting,
      purchasePrice: s.purchasePrice,
      isLoanedIn: false,
      isLoanedOut: loanedOutIds.has(s.player.id),
      loanFixturesRemaining: null as number | null,
      player: s.player,
    }));

    const allSquad = [...ownedMapped, ...borrowedEntries];
    const allStarters = allSquad.filter((s) => s.isStarting);
    const allBench = allSquad.filter((s) => !s.isStarting);

    return apiSuccess({
      room: {
        code: room.code,
        name: room.name,
        phase: room.phase,
      },
      user: {
        id: user.id,
        displayName: user.displayName,
        teamName: user.teamName,
        budget: user.budget,
        isAdmin: user.isAdmin,
      },
      squad: allSquad,
      starters: allStarters,
      bench: allBench,
      counts: {
        total: allSquad.length,
        starters: allStarters.length,
        maxStarters: MAX_STARTERS,
        squadLimit: SQUAD_LIMIT,
      },
    });
  } catch (err) {
    console.error("Squad GET error:", err);
    return apiError("Failed to load squad", 500);
  }
}
