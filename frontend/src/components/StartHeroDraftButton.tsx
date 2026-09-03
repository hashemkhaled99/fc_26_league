"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartHeroDraftButton({ roomCode, className }: { roomCode: string; className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${roomCode}/hero-draft`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start draft");
      router.push(`/room/${roomCode}/draft`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button onClick={handleStart} disabled={loading} className="fc-btn-primary w-full text-lg">
        {loading ? "Starting..." : "Start Hero Draft"}
      </button>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <p className="text-xs text-fc-muted mt-2 text-center">
        18 rounds · sequential bidding · Gold / Hero / Icon tiers
      </p>
    </div>
  );
}
