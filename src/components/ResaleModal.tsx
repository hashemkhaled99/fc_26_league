"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/utils";
import type { SquadEntry } from "./SquadPlayerCard";

interface ResaleModalProps {
  entry: SquadEntry;
  onClose: () => void;
  onConfirm: (squadPlayerId: string, startingPrice: number) => Promise<void>;
}

export function ResaleModal({ entry, onClose, onConfirm }: ResaleModalProps) {
  const defaultPrice = Math.max(entry.purchasePrice, 1_000_000);
  const [priceM, setPriceM] = useState(Math.round(defaultPrice / 1_000_000));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const startingPrice = Math.max(1, priceM) * 1_000_000;
    setLoading(true);
    setError("");
    try {
      await onConfirm(entry.id, startingPrice);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="fc-card w-full max-w-md p-6 shadow-glow">
        <h3 className="font-display text-xl font-bold text-fc-gold">List for Resale</h3>
        <p className="mt-1 text-sm text-fc-muted">
          {entry.player.name} · {entry.player.position} · Paid{" "}
          {formatMoney(entry.purchasePrice)}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-fc-muted">
              Starting price (millions)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="fc-input font-mono"
                value={priceM}
                onChange={(e) => setPriceM(Number(e.target.value))}
                required
              />
              <span className="font-bold text-fc-green">M</span>
            </div>
            <p className="mt-1 text-xs text-fc-muted">
              Asking {formatMoney(Math.max(1, priceM) * 1_000_000)} — first bid can take this price
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="fc-btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="fc-btn-primary flex-1">
              {loading ? "Listing..." : "List on Market"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
