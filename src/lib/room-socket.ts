import type { Socket } from "socket.io-client";

/** Refresh page data when an admin or game event changes manager budgets */
export function onBudgetUpdated(socket: Socket, reload: () => void) {
  socket.on("budget:updated", reload);
}
