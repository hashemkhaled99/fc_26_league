import { AsyncLocalStorage } from "async_hooks";
import type { Prisma } from "@prisma/client";

export const UNPAID_ROLL_ACQUISITION = "random_roll_unpaid";
export const PAID_ROLL_ACQUISITION = "random_roll";

type Tx = Prisma.TransactionClient;

const lockTail = new Map<string, Promise<unknown>>();
const heldRooms = new AsyncLocalStorage<Set<string>>();

/**
 * Serialize Hero Draft budget mutations per room.
 * Nested calls for the same room (resolve → finishRoundAdvance) are re-entrant.
 */
export function withHeroDraftLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const held = heldRooms.getStore();
  if (held?.has(roomId)) return fn();

  const prev = lockTail.get(roomId) ?? Promise.resolve();
  const run = prev.then(
    () => heldRooms.run(new Set([...(held ?? []), roomId]), fn),
    () => heldRooms.run(new Set([...(held ?? []), roomId]), fn)
  );
  lockTail.set(
    roomId,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

export async function lockHeroDraftRoom(tx: Tx, roomId: string) {
  const key = advisoryKey(roomId);
  // Two-key advisory locks are (int, int). Prisma binds JS numbers as bigint,
  // which would call a non-existent (int, bigint) overload.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(884721::int, ${key}::int)`;
}

/** Debit only if the user still has enough — never go negative. */
export async function tryDebitBudget(tx: Tx, userId: string, amount: number) {
  if (amount <= 0) return true;
  const result = await tx.user.updateMany({
    where: { id: userId, budget: { gte: amount } },
    data: { budget: { decrement: amount } },
  });
  return result.count > 0;
}

export async function creditBudget(tx: Tx, userId: string, amount: number) {
  if (amount <= 0) return;
  await tx.user.update({
    where: { id: userId },
    data: { budget: { increment: amount } },
  });
}

function advisoryKey(roomId: string) {
  let h = 0;
  for (let i = 0; i < roomId.length; i++) {
    h = (Math.imul(31, h) + roomId.charCodeAt(i)) | 0;
  }
  return h === 0 ? 1 : h;
}
