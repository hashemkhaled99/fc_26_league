"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/utils";
import type { SquadEntry } from "./SquadPlayerCard";

interface ResaleModalProps {
  entry: SquadEntry;
  onClose: () => void;
  onConfirm: (squadPlayerId: string, startingPrice: number) => Promise<void>;
  onInstantSell?: (squadPlayerId: string) => Promise<void>;
  /** When true, Instant Sell is expanded/ready to confirm immediately (mobile shortcut). */
  preferInstant?: boolean;
}

export function ResaleModal({
  entry,
  onClose,
  onConfirm,
  onInstantSell,
  preferInstant = false,
}: ResaleModalProps) {
  const defaultPrice = Math.max(entry.purchasePrice, 1_000_000);
  const [priceM, setPriceM] = useState(Math.round(defaultPrice / 1_000_000));
  const [loading, setLoading] = useState(false);
  const [instantLoading, setInstantLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmInstant, setConfirmInstant] = useState(preferInstant);

  const instantRefund = Math.floor(Math.max(0, entry.purchasePrice) / 2);

  useEffect(() => {
    setConfirmInstant(preferInstant);
  }, [preferInstant, entry.id]);

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

  async function handleInstantSell() {
    if (!onInstantSell) return;
    if (!confirmInstant) {
      setConfirmInstant(true);
      return;
    }
    setInstantLoading(true);
    setError("");
    try {
      await onInstantSell(entry.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to instant sell");
      setConfirmInstant(false);
    } finally {
      setInstantLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fc-card flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl shadow-glow sm:rounded-2xl">
        <div className="overflow-y-auto overscroll-contain p-5 sm:p-6">
          <h3 className="font-display text-xl font-bold text-fc-gold">Sell Player</h3>
          <p className="mt-1 text-sm text-fc-muted">
            {entry.player.name} · {entry.player.position} · Paid{" "}
            {formatMoney(entry.purchasePrice)}
          </p>

          {onInstantSell && (
            <div
              id="instant-sell-section"
              className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4"
            >
              <p className="font-display text-sm font-bold text-amber-200">Instant Sell</p>
              <p className="mt-1 text-xs text-fc-muted">
                Sell immediately for{" "}
                <span className="font-mono font-bold text-fc-green">
                  {formatMoney(instantRefund)}
                </span>{" "}
                (50% of purchase price). Player returns to the market — no auction.
              </p>
              <button
                type="button"
                disabled={instantLoading || loading}
                onClick={handleInstantSell}
                className={`mt-3 min-h-[44px] w-full rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${
                  confirmInstant
                    ? "bg-amber-500 text-fc-navy hover:bg-amber-400"
                    : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                }`}
              >
                {instantLoading
                  ? "Selling..."
                  : confirmInstant
                    ? `Confirm Instant Sell · ${formatMoney(instantRefund)}`
                    : `Instant Sell for ${formatMoney(instantRefund)}`}
              </button>
              {confirmInstant && !instantLoading && (
                <button
                  type="button"
                  className="mt-2 min-h-[40px] w-full text-xs text-fc-muted hover:text-white"
                  onClick={() => setConfirmInstant(false)}
                >
                  Cancel instant sell
                </button>
              )}
            </div>
          )}

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-fc-muted">
              or list on market
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-fc-muted">
                Starting price (millions)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="fc-input font-mono min-h-[44px]"
                  value={priceM}
                  onChange={(e) => setPriceM(Number(e.target.value))}
                  required
                />
                <span className="font-bold text-fc-green">M</span>
              </div>
              <p className="mt-1 text-xs text-fc-muted">
                Asking {formatMoney(Math.max(1, priceM) * 1_000_000)} — auction runs for{" "}
                <span className="text-fc-gold font-semibold">30 minutes</span> (or until the market
                deadline if sooner)
              </p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="fc-btn-secondary min-h-[44px] flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || instantLoading}
                className="fc-btn-primary min-h-[44px] flex-1"
              >
                {loading ? "Listing..." : "List on Market"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
