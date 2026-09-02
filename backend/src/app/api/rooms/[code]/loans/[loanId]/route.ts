import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { executeLoan, returnLoan, validateLoanProposal } from "@/lib/loans/engine";
import { emitToRoom } from "@/lib/socket-emit";
import { apiError, apiSuccess } from "@/lib/api";

const schema = z.object({
  action: z.enum(["accept", "reject", "cancel", "recall"]),
});

export async function POST(
  request: Request,
  { params }: { params: { code: string; loanId: string } }
) {
  try {
    const session = await getSession();
    if (!session.userId) return apiError("Not authenticated", 401);

    const code = params.code.toUpperCase();
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return apiError("Room not found");
    if (room.id !== session.roomId) return apiError("Wrong room");

    const loan = await prisma.loan.findFirst({
      where: { id: params.loanId, roomId: room.id },
    });
    if (!loan) return apiError("Loan not found");

    const body = await request.json();
    const data = schema.parse(body);

    if (data.action === "cancel") {
      if (loan.status !== "pending" || loan.lenderId !== session.userId) {
        return apiError("Only the lender can cancel a pending loan");
      }
      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: "cancelled" },
      });
      await emitToRoom(code, "loan:resolved", {
        loanId: loan.id,
        status: "cancelled",
        lenderId: loan.lenderId,
        borrowerId: loan.borrowerId,
      });
      return apiSuccess({ status: "cancelled" });
    }

    if (data.action === "reject") {
      if (loan.status !== "pending" || loan.borrowerId !== session.userId) {
        return apiError("Only the borrower can reject");
      }
      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: "rejected" },
      });
      await emitToRoom(code, "loan:resolved", {
        loanId: loan.id,
        status: "rejected",
        lenderId: loan.lenderId,
        borrowerId: loan.borrowerId,
      });
      return apiSuccess({ status: "rejected" });
    }

    if (data.action === "accept") {
      if (loan.status !== "pending" || loan.borrowerId !== session.userId) {
        return apiError("Only the borrower can accept");
      }

      const check = await validateLoanProposal({
        lenderId: loan.lenderId,
        borrowerId: loan.borrowerId,
        playerId: loan.playerId,
        loanFee: loan.loanFee,
        fixturesTotal: loan.fixturesTotal,
      });
      if (!check.ok) return apiError(check.reason);

      await executeLoan(loan.id);

      await emitToRoom(code, "loan:resolved", {
        loanId: loan.id,
        status: "active",
        lenderId: loan.lenderId,
        borrowerId: loan.borrowerId,
      });
      await emitToRoom(code, "squad:updated", { userId: loan.lenderId });
      await emitToRoom(code, "squad:updated", { userId: loan.borrowerId });

      return apiSuccess({ status: "active" });
    }

    if (data.action === "recall") {
      if (loan.status !== "active" || loan.lenderId !== session.userId) {
        return apiError("Only the lender can recall an active loan");
      }
      await returnLoan(loan.id);
      await emitToRoom(code, "loan:resolved", {
        loanId: loan.id,
        status: "returned",
        lenderId: loan.lenderId,
        borrowerId: loan.borrowerId,
      });
      await emitToRoom(code, "squad:updated", { userId: loan.lenderId });
      await emitToRoom(code, "squad:updated", { userId: loan.borrowerId });
      return apiSuccess({ status: "returned" });
    }

    return apiError("Unknown action");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors[0]?.message ?? "Invalid input");
    }
    console.error("Loan action error:", err);
    return apiError(err instanceof Error ? err.message : "Loan action failed", 500);
  }
}
