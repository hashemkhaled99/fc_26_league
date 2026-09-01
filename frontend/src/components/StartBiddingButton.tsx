"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface StartBiddingButtonProps {
  roomCode: string;
  className?: string;
}

export function StartBiddingButton({ roomCode, className }: StartBiddingButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${roomCode}/start-bidding`), { ...apiFetchInit, method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start bidding");
      router.push(`/room/${roomCode}/market`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={handleStart}
        disabled={loading}
        className="fc-btn-primary w-full text-lg"
      >
        {loading ? "Starting..." : "🚀 Start Bidding Phase"}
      </button>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <p className="text-xs text-fc-muted mt-2 text-center">
        Seeds ~1,700 FC26 gold players and opens the live market
      </p>
    </div>
  );
}
