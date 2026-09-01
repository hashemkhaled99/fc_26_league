import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const CHECK_INTERVAL_MS = 1000;
const dev = process.env.NODE_ENV !== "production";

if (!process.env.DATABASE_URL) {
  console.error(
    "FATAL: DATABASE_URL is required. Link the Northflank Postgres addon or set DATABASE_URL in your service environment."
  );
  process.exit(1);
}

const frontendOrigin = process.env.FRONTEND_URL ?? "http://localhost:3000";
const nextApp = next({ dev, hostname: "0.0.0.0", port: PORT });
const handle = nextApp.getRequestHandler();

const roomMembers = new Map<string, Set<string>>();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function handleHealth(res: ServerResponse) {
  let db = false;
  let redis: boolean | undefined;

  try {
    const { prisma } = await import("./src/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }

  if (process.env.REDIS_URL) {
    const { pingRedis } = await import("./src/lib/timerStore");
    redis = await pingRedis();
  }

  const body: Record<string, unknown> = { status: "ok", db };
  if (process.env.REDIS_URL) {
    body.redis = redis;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleInternalEmit(req: IncomingMessage, res: ServerResponse, io: Server) {
  try {
    const body = JSON.parse(await readBody(req));
    const { roomCode, event, data } = body;
    io.to(roomCode.toUpperCase()).emit(event, data);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.writeHead(400);
    res.end("Bad request");
  }
}

async function main() {
  await nextApp.prepare();

  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: {
      origin: frontendOrigin,
      methods: ["GET", "POST"],
    },
  });

  httpServer.on("request", async (req, res) => {
    const parsedUrl = parse(req.url ?? "", true);
    const pathname = parsedUrl.pathname ?? "";

    if (req.method === "GET" && pathname === "/health") {
      await handleHealth(res);
      return;
    }

    if (req.method === "POST" && pathname === "/internal/emit") {
      await handleInternalEmit(req, res, io);
      return;
    }

    await handle(req, res, parsedUrl);
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("room:join", ({ roomCode }: { roomCode: string }) => {
      const code = roomCode.toUpperCase();
      socket.join(code);

      if (!roomMembers.has(code)) roomMembers.set(code, new Set());
      roomMembers.get(code)!.add(socket.id);

      socket.emit("room:joined", {
        roomCode: code,
        memberCount: roomMembers.get(code)!.size,
      });
      io.to(code).emit("lobby:updated", { memberCount: roomMembers.get(code)!.size });
    });

    socket.on("disconnect", () => {
      for (const [code, members] of roomMembers.entries()) {
        if (members.has(socket.id)) {
          members.delete(socket.id);
          io.to(code).emit("lobby:updated", { memberCount: members.size });
        }
      }
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  async function runAuctionCloser() {
    try {
      const { getExpiredAuctionIds, clearAuctionEnd } = await import("./src/lib/timerStore");
      const { closeAuction } = await import("./src/lib/auction/close");
      const { prisma } = await import("./src/lib/prisma");

      const memoryExpired = await getExpiredAuctionIds();
      const dbExpired = await prisma.auction.findMany({
        where: { status: "active", endsAt: { lte: new Date() } },
        select: { id: true },
        take: 20,
      });

      const expiredIds = [...new Set([...memoryExpired, ...dbExpired.map((a) => a.id)])];

      for (const auctionId of expiredIds) {
        const result = await closeAuction(auctionId);
        await clearAuctionEnd(auctionId);
        if (!result) continue;

        io.to(result.roomCode).emit("auction:closed", result);

        if (result.status === "closed" && result.winnerId) {
          io.to(result.roomCode).emit("squad:updated", { userId: result.winnerId });
        }
        if (result.sellerId) {
          io.to(result.roomCode).emit("squad:updated", { userId: result.sellerId });
        }
      }
    } catch (err) {
      console.error("Auction closer error:", err);
    }
  }

  const lockedRooms = new Set<string>();

  async function runTransferWindowWatcher() {
    try {
      const { prisma } = await import("./src/lib/prisma");
      const { forceCloseAllAuctions } = await import("./src/lib/admin/market");

      const due = await prisma.roomSettings.findMany({
        where: {
          transferWindowEndsAt: { lte: new Date() },
          room: { phase: "bidding" },
        },
        include: { room: { select: { id: true, code: true } } },
        take: 10,
      });

      const dueIds = new Set(due.map((s) => s.roomId));
      lockedRooms.forEach((id) => {
        if (!dueIds.has(id)) lockedRooms.delete(id);
      });

      for (const s of due) {
        if (lockedRooms.has(s.roomId)) continue;
        lockedRooms.add(s.roomId);

        const active = await prisma.auction.count({
          where: { roomId: s.roomId, status: "active" },
        });
        if (active > 0) {
          await forceCloseAllAuctions(s.roomId, s.room.code);
        }

        io.to(s.room.code).emit("market:locked", { reason: "window_ended" });
        io.to(s.room.code).emit("settings:updated", {
          transferWindowEndsAt: s.transferWindowEndsAt?.toISOString(),
          marketLocked: true,
        });
      }
    } catch (err) {
      console.error("Transfer window watcher error:", err);
    }
  }

  setInterval(runAuctionCloser, CHECK_INTERVAL_MS);
  setInterval(runTransferWindowWatcher, 5000);

  httpServer.listen(PORT, () => {
    console.log(`FC26 backend (API + Socket.io) running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
