"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useEffect, useState } from "react";

interface Deal {
  id: string;
  line: string;
}

interface DealTickerProps {
  roomCode: string;
  liveLine?: string | null;
}

export function DealTicker({ roomCode, liveLine }: DealTickerProps) {
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    fetch(apiPath(`/api/rooms/${roomCode}/deals`), apiFetchInit)
      .then((r) => r.json())
      .then((d) => setDeals(d.deals ?? []))
      .catch(() => undefined);
  }, [roomCode]);

  useEffect(() => {
    if (!liveLine) return;
    setDeals((prev) => [{ id: `live-${Date.now()}`, line: liveLine }, ...prev].slice(0, 30));
  }, [liveLine]);

  if (deals.length === 0) return null;

  const text = deals.map((d) => d.line).join("   ·   ");

  return (
    <div className="overflow-hidden rounded-xl border border-fc-gold/20 bg-fc-charcoal/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fc-gold">
          <span className="fc-live-dot scale-75" />
          Live deals
        </span>
        <div className="relative flex-1 overflow-hidden ticker-fade">
          <div className="animate-ticker whitespace-nowrap text-sm text-white/90">
            {text}
            <span className="mx-8 text-fc-muted">·</span>
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}
