"use client";

import { apiPath, apiFetchInit, readApiJson } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoadingPulse } from "@/components/LoadingPulse";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { getPublicSocketUrl } from "@/lib/public-env";
import Link from "next/link";

type Payload = {
  room: { code: string; name: string; phase: string };
  state: { tradeWindowEndsAt: string | null; status: string } | null;
  me: { teamName: string; budget: number; isAdmin: boolean } | null;
  error?: string;
};

export default function TradeWindowPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const [data, setData] = useState<Payload | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), apiFetchInit);
    if (res.status === 401) {
      router.replace("/");
      return;
    }
    const payload = await readApiJson<Payload>(res);
    if (!res.ok) throw new Error(payload.error ?? "Failed to load");
    setData(payload);
  }, [code, router]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const ends = data?.state?.tradeWindowEndsAt;
    if (!ends) return;
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((new Date(ends).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [data?.state?.tradeWindowEndsAt]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    let socket: { disconnect: () => void } | null = null;
    import("socket.io-client").then(({ io }) => {
      const s = io(socketUrl, { transports: ["websocket", "polling"] });
      socket = s;
      s.on("connect", () => s.emit("room:join", { roomCode: code }));
      s.on("tradeWindow:ended", () => router.push(`/room/${code}/draft-recap`));
      s.on("draftRecap:ready", () => router.push(`/room/${code}/draft-recap`));
    });
    return () => socket?.disconnect();
  }, [code, router]);

  async function closeWindow() {
    const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), {
      ...apiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_trade_window" }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Failed");
      return;
    }
    router.push(`/room/${code}/draft-recap`);
  }

  if (!data) return <LoadingPulse label="Opening trade window..." />;

  const mins = Math.floor(left / 60);
  const secs = left % 60;

  return (
    <RoomLayoutShell
      code={data.room.code}
      roomName={data.room.name}
      phase={data.room.phase}
      teamName={data.me?.teamName}
      budget={data.me?.budget}
      isAdmin={data.me?.isAdmin}
    >
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <h2 className="font-display text-3xl font-bold text-fc-gold">Trade Window</h2>
        <p className="text-fc-muted">
          Swap drafted players before squads lock. No new auctions or rolls.
        </p>
        <p className="font-mono text-5xl font-bold text-white">
          {mins}:{secs.toString().padStart(2, "0")}
        </p>
        <Link href={`/room/${code}/trades`} className="fc-btn-primary inline-block">
          Open Trade Center
        </Link>
        {data.me?.isAdmin && (
          <button className="fc-btn-secondary block w-full" onClick={closeWindow}>
            Force close window
          </button>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </RoomLayoutShell>
  );
}
