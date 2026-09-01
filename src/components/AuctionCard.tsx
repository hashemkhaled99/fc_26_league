"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Countdown } from "./Countdown";
import { formatMoney, formatMoneyFull } from "@/lib/utils";
import { MIN_BID_INCREMENT } from "@/lib/auction/constants";

interface Player {
  id: string;
  name: string;
  realTeam: string;
  position: string;
  baseRating: number;
}

interface Bidder {
  id: string;
  displayName: string;
  teamName: string;
}

interface AuctionCardProps {
  auction: {
    id: string;
    player: Player;
    currentBid: number;
    currentBidderId: string | null;
    currentBidder: Bidder | null;
    endsAt: string;
    startingPrice: number;
    isResale?: boolean;
    sellerId?: string | null;
  };
  currentUserId: string;
  onBid: (auctionId: string, amount: number) => Promise<void>;
  onExpire?: () => void;
  locked?: boolean;
  index?: number;
}

export function AuctionCard({
  auction,
  currentUserId,
  onBid,
  onExpire,
  locked,
  index = 0,
}: AuctionCardProps) {
  const reduced = useReducedMotion();
  const [bidding, setBidding] = useState(false);
  const isFirstBid = !auction.currentBidderId;
  const minBid = isFirstBid
    ? auction.currentBid
    : auction.currentBid + MIN_BID_INCREMENT;
  const isHighest = auction.currentBidderId === currentUserId;
  const isOwnResale = Boolean(auction.isResale && auction.sellerId === currentUserId);
  const canBid = !locked && !isHighest && !isOwnResale;

  async function handleBid() {
    setBidding(true);
    try {
      await onBid(auction.id, minBid);
    } finally {
      setBidding(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : Math.min(index * 0.06, 0.35), type: "spring", stiffness: 320, damping: 28 }}
      whileHover={reduced ? undefined : { y: -3 }}
      className={`fc-card overflow-hidden ${
        auction.isResale ? "border-fc-accent/40 shadow-glow-accent" : "border-fc-gold/30 shadow-glow"
      }`}
    >
      <div className="bg-gradient-to-r from-fc-gold/10 to-transparent px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-fc-gold uppercase tracking-wider flex items-center gap-2">
          <span className="fc-live-dot" />
          {auction.isResale ? "Resale Auction" : "Live Auction"}
        </span>
        <Countdown endsAt={auction.endsAt} onExpire={onExpire} />
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="font-display text-3xl font-bold text-fc-gold drop-shadow">
            {auction.player.baseRating}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-bold truncate">{auction.player.name}</p>
            <p className="text-sm text-fc-muted">
              {auction.player.position} · {auction.player.realTeam}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-fc-charcoal/80 p-3 border border-white/5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-fc-muted">
              {isFirstBid ? "Asking price" : "Current bid"}
            </span>
            <motion.span
              key={auction.currentBid}
              initial={reduced ? false : { scale: 1.15, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-mono text-xl font-bold text-fc-green"
            >
              {formatMoney(auction.currentBid)}
            </motion.span>
          </div>
          {auction.currentBidder && (
            <p className="text-xs text-fc-muted mt-1">
              Highest: <span className="text-white font-medium">{auction.currentBidder.teamName}</span>
            </p>
          )}
          {!auction.currentBidder && (
            <p className="text-xs text-fc-muted mt-1">No bids yet — take it at asking price</p>
          )}
        </div>

        {isOwnResale ? (
          <p className="mt-4 text-center text-sm text-fc-accent font-semibold">
            Your listing — waiting for buyers
          </p>
        ) : locked ? (
          <p className="mt-4 text-center text-sm text-red-300 font-semibold">
            Market locked
          </p>
        ) : canBid ? (
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.97 }}
            onClick={handleBid}
            disabled={bidding}
            className="fc-btn-primary w-full mt-4 text-sm"
          >
            {bidding
              ? "Bidding..."
              : isFirstBid
                ? `Bid ${formatMoney(minBid)}`
                : `Bid ${formatMoney(minBid)} (+${formatMoneyFull(MIN_BID_INCREMENT)})`}
          </motion.button>
        ) : (
          <motion.p
            initial={reduced ? false : { scale: 0.95 }}
            animate={{ scale: 1 }}
            className="mt-4 text-center text-sm text-fc-green font-semibold"
          >
            ✓ You&apos;re winning!
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
