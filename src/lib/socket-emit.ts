const port = process.env.PORT ?? process.env.SOCKET_PORT ?? "3001";
const SOCKET_URL =
  process.env.SOCKET_INTERNAL_URL ?? `http://127.0.0.1:${port}`;

export async function emitToRoom(
  roomCode: string,
  event: string,
  data: unknown
): Promise<void> {
  try {
    await fetch(`${SOCKET_URL}/internal/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: roomCode.toUpperCase(), event, data }),
    });
  } catch (err) {
    console.error("Socket emit failed:", err);
  }
}
