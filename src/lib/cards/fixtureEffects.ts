import { prisma } from "@/lib/prisma";
import { getActiveEffects } from "@/lib/cards/effects";

/** Resolve pending fixture-card effects when a match is confirmed. */
export async function applyFixtureCardEffects(match: {
  id: string;
  roomId: string;
  homeUserId: string;
  awayUserId: string;
  homeScore: number;
  awayScore: number;
}) {
  const effects = await getActiveEffects(match.roomId);
  const notes: string[] = [];
  let homeBonusPts = 0;
  let awayBonusPts = 0;

  async function pay(userId: string, amount: number, reason: string) {
    if (amount === 0) return;
    if (amount > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { budget: { increment: amount } },
      });
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { budget: { decrement: Math.abs(amount) } },
      });
    }
    notes.push(`${reason}: ${amount > 0 ? "+" : ""}${amount / 1_000_000}M`);
  }

  async function consume(id: string) {
    await prisma.marketEffect.delete({ where: { id } }).catch(() => undefined);
  }

  for (const side of [
    { userId: match.homeUserId, scored: match.homeScore, conceded: match.awayScore, home: true },
    { userId: match.awayUserId, scored: match.awayScore, conceded: match.homeScore, home: false },
  ] as const) {
    const mine = effects.filter((e) => e.casterId === side.userId);
    const won =
      (side.home && match.homeScore > match.awayScore) ||
      (!side.home && match.awayScore > match.homeScore);
    const drew = match.homeScore === match.awayScore;
    const lost = !won && !drew;

    for (const e of mine) {
      if (e.type === "derby_boost" && e.auctionId === match.id) {
        await pay(side.userId, 8_000_000, "Derby Boost");
        await consume(e.id);
        continue;
      }

      // One-shot "next match" effects (no match binding)
      if (e.auctionId && e.auctionId !== match.id) continue;

      if (e.type === "matchday_pay") {
        await pay(side.userId, 6_000_000, "Matchday Pay");
        await consume(e.id);
      } else if (e.type === "clean_sheet_cash" && side.conceded === 0) {
        await pay(side.userId, 12_000_000, "Clean Sheet");
        await consume(e.id);
      } else if (e.type === "clean_sheet_cash") {
        await consume(e.id);
      } else if (e.type === "goal_bounty") {
        const amount = side.scored * 2_000_000;
        await pay(side.userId, amount, "Goal Bounty");
        await consume(e.id);
      } else if (e.type === "draw_insurance") {
        if (drew) await pay(side.userId, 10_000_000, "Draw Insurance");
        await consume(e.id);
      } else if (e.type === "home_crowd") {
        if (side.home && won) await pay(side.userId, 15_000_000, "Home Crowd");
        if (side.home) await consume(e.id);
      } else if (e.type === "away_day") {
        if (!side.home && won) await pay(side.userId, 18_000_000, "Away Day");
        if (!side.home) await consume(e.id);
      } else if (e.type === "must_win_wager") {
        if (won) await pay(side.userId, 25_000_000, "Must Win");
        else if (lost) await pay(side.userId, -8_000_000, "Must Win loss");
        await consume(e.id);
      } else if (e.type === "double_points" && won) {
        if (side.home) homeBonusPts += 3;
        else awayBonusPts += 3;
        notes.push("Double Points (+3 bonus pts)");
        await consume(e.id);
      } else if (e.type === "double_points" && !won) {
        await consume(e.id);
      }
    }
  }

  if (homeBonusPts || awayBonusPts) {
    await prisma.match.update({
      where: { id: match.id },
      data: { homeBonusPts, awayBonusPts },
    });
  }

  return { notes, homeBonusPts, awayBonusPts };
}
