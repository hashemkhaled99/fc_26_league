import { prisma } from "@/lib/prisma";

const MERCY_LOSS_STREAK = 3;
const MERCY_BONUS = 5_000_000;

/**
 * Update streaks after a confirmed match and pay cash bonuses when thresholds hit.
 */
export async function applyMatchStreaks(match: {
  homeUserId: string;
  awayUserId: string;
  homeScore: number;
  awayScore: number;
  roomId: string;
}) {
  const settings = await prisma.roomSettings.findUnique({
    where: { roomId: match.roomId },
  });
  const bonusesEnabled = settings?.streakBonusEnabled ?? true;
  const bonusAt3 = settings?.streakBonusAt3 ?? 15_000_000;
  const bonusAt5 = settings?.streakBonusAt5 ?? 30_000_000;

  const paid: Array<{ userId: string; reason: string; amount: number }> = [];

  async function updateUser(userId: string, result: "win" | "draw" | "loss") {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    let currentStreak = user.currentStreak;
    let currentStreakType = user.currentStreakType;
    let bestStreakSeason = user.bestStreakSeason;
    let budgetBump = 0;
    let reason = "";

    if (result === "win") {
      if (currentStreakType === "win") currentStreak += 1;
      else {
        currentStreak = 1;
        currentStreakType = "win";
      }
      if (currentStreak > bestStreakSeason) bestStreakSeason = currentStreak;

      if (bonusesEnabled) {
        if (currentStreak === 3) {
          budgetBump = bonusAt3;
          reason = "🔥 3-win streak";
        } else if (currentStreak === 5) {
          budgetBump = bonusAt5;
          reason = "🔥 5-win streak";
        }
      }
    } else if (result === "loss") {
      const saver = await prisma.marketEffect.findFirst({
        where: { roomId: match.roomId, type: "streak_saver", casterId: userId },
      });
      if (saver && currentStreakType === "win" && currentStreak > 0) {
        // Keep win streak; consume saver
        await prisma.marketEffect.delete({ where: { id: saver.id } });
        paid.push({ userId, reason: "Streak Saver", amount: 0 });
      } else {
        if (currentStreakType === "loss") currentStreak += 1;
        else {
          currentStreak = 1;
          currentStreakType = "loss";
        }
        if (bonusesEnabled && currentStreak === MERCY_LOSS_STREAK) {
          budgetBump = MERCY_BONUS;
          reason = "Mercy bonus (3 losses)";
        }
      }
    } else {
      currentStreak = 0;
      currentStreakType = null;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak,
        currentStreakType,
        bestStreakSeason,
        ...(budgetBump > 0 ? { budget: { increment: budgetBump } } : {}),
      },
    });

    if (budgetBump > 0) {
      paid.push({ userId, reason, amount: budgetBump });
    }
  }

  if (match.homeScore > match.awayScore) {
    await updateUser(match.homeUserId, "win");
    await updateUser(match.awayUserId, "loss");
  } else if (match.homeScore < match.awayScore) {
    await updateUser(match.awayUserId, "win");
    await updateUser(match.homeUserId, "loss");
  } else {
    await updateUser(match.homeUserId, "draw");
    await updateUser(match.awayUserId, "draw");
  }

  return paid;
}
