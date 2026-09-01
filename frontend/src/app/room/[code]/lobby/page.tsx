"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LoadingPulse } from "@/components/LoadingPulse";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { formatMoney } from "@/lib/utils";
import { StartBiddingButton } from "@/components/StartBiddingButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { onBudgetUpdated } from "@/lib/room-socket";
import { getPublicSocketUrl } from "@/lib/public-env";
import Link from "next/link";

interface LobbyUser {
  id: string;
  displayName: string;
  teamName: string;
  isAdmin: boolean;
  budget: number;
}

interface LobbyData {
  room: {
    id: string;
    code: string;
    name: string;
    phase: string;
    currentSeason: number;
    userCount: number;
  };
  users: LobbyUser[];
  currentUser: LobbyUser | null;
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const [data, setData] = useState<LobbyData | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [kickTarget, setKickTarget] = useState<LobbyUser | null>(null);
  const [kicking, setKicking] = useState(false);

  async function loadLobby() {
    const res = await fetch(apiPath(`/api/rooms/${code}/lobby`), apiFetchInit);
    if (res.status === 401) {
      router.replace("/");
      throw new Error("Session expired");
    }
    if (!res.ok) throw new Error("Failed to load lobby");
    return res.json() as Promise<LobbyData>;
  }

  async function removePlayer(user: LobbyUser) {
    setKicking(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/admin/actions`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "kick_user", userId: user.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove player");
      setKickTarget(null);
      setData(await loadLobby());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove player");
    } finally {
      setKicking(false);
    }
  }

  useEffect(() => {
    loadLobby()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [code, router]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    import("socket.io-client").then(({ io }) => {
      const socket = io(socketUrl, { transports: ["websocket", "polling"] });
      socket.on("connect", () => {
        setConnected(true);
        socket.emit("room:join", { roomCode: code });
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("lobby:updated", () => {
        loadLobby().then(setData).catch(() => undefined);
      });
      onBudgetUpdated(socket, () => {
        loadLobby().then(setData).catch(() => undefined);
      });
      socket.on("phase:changed", () => {
        loadLobby().then(setData).catch(() => undefined);
      });
      return () => socket.disconnect();
    });
  }, [code]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <LoadingPulse label="Loading lobby..." />;
  }

  const { room, users, currentUser } = data;

  return (
    <RoomLayoutShell
      code={room.code}
      roomName={room.name}
      phase={room.phase}
      teamName={currentUser?.teamName}
      budget={currentUser?.budget}
      isAdmin={currentUser?.isAdmin}
    >
      {kickTarget && (
        <ConfirmModal
          title={`Remove ${kickTarget.teamName}?`}
          message={`This will remove ${kickTarget.displayName} and their squad from the room.`}
          confirmLabel="Remove"
          danger
          loading={kicking}
          onCancel={() => !kicking && setKickTarget(null)}
          onConfirm={() => removePlayer(kickTarget)}
        />
      )}

      <div className="space-y-6">
        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <GlowCard glow="gold">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold">Waiting Room</h2>
              <p className="text-fc-muted mt-1">
                Season {room.currentSeason} · {room.userCount}/20 players
              </p>
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <span className="fc-live-dot" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
              <span className="text-sm text-fc-muted">
                {connected ? "Live" : "Connecting..."}
              </span>
            </div>
          </div>

          {room.phase === "lobby" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-lg bg-fc-gold/10 border border-fc-gold/20 p-4"
            >
              <p className="text-fc-gold font-semibold">Share this code with friends:</p>
              <p className="font-mono text-2xl font-bold mt-1 tracking-wider">{room.code}</p>
            </motion.div>
          )}

          {currentUser?.isAdmin && room.phase === "lobby" && (
            <div className="mt-4">
              <StartBiddingButton roomCode={room.code} />
            </div>
          )}

          {room.phase === "bidding" && (
            <div className="mt-4">
              <Link href={`/room/${room.code}/market`} className="fc-btn-primary block text-center">
                Go to Live Market →
              </Link>
            </div>
          )}
        </GlowCard>

        <GlowCard>
          <h3 className="font-display text-lg font-semibold mb-4">Players in Room</h3>
          <ul className="space-y-2">
            {users.map((user, i) => (
              <motion.li
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between rounded-lg bg-fc-charcoal/50 px-4 py-3 border border-white/5"
              >
                <div>
                  <span className="font-semibold">{user.teamName}</span>
                  <span className="text-fc-muted text-sm ml-2">({user.displayName})</span>
                  {user.isAdmin && (
                    <span className="ml-2 text-xs bg-fc-gold/20 text-fc-gold px-2 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-fc-green font-mono text-sm">
                    {formatMoney(user.budget)}
                  </span>
                  {currentUser?.isAdmin && !user.isAdmin && room.phase === "lobby" && (
                    <button
                      type="button"
                      className="rounded-lg border border-red-400/30 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-400/10"
                      onClick={() => setKickTarget(user)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
          {users.length < 10 && (
            <p className="mt-4 text-sm text-fc-muted text-center">
              Waiting for more players... (recommended 10–20)
            </p>
          )}
        </GlowCard>
      </div>
    </RoomLayoutShell>
  );
}
