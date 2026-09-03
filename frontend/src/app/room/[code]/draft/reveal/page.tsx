"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TierPlayerCard, type DraftPlayer } from "@/components/TierPlayerCard";
import { formatMoney } from "@/lib/utils";
import Link from "next/link";

type Reveal = {
  tier: string;
  rating: number;
  deductionAmount: number;
  deductionType: string;
  player?: DraftPlayer;
};

export default function DraftRevealPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const [reveal, setReveal] = useState<Reveal | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("heroDraftReveal");
      if (raw) setReveal(JSON.parse(raw) as Reveal);
    } catch {
      /* ignore */
    }
  }, []);

  if (!reveal?.player) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-fc-muted">No reveal ready.</p>
        <Link href={`/room/${code}/draft`} className="fc-btn-secondary">
          Back to draft
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 bg-gradient-to-b from-black via-fc-navy to-fc-charcoal">
      <motion.p
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-sm uppercase tracking-[0.35em] text-fc-gold"
      >
        Pack reveal
      </motion.p>
      <motion.div
        initial={{ scale: 0.5, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
        className="w-full max-w-sm"
      >
        <TierPlayerCard player={{ ...reveal.player, tier: reveal.tier }} size="lg" highlight />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center space-y-1"
      >
        <p className="text-fc-muted text-sm">
          Charged{" "}
          <span className="text-fc-green font-mono font-bold">
            {formatMoney(reveal.deductionAmount)}
          </span>
        </p>
        <p className="text-xs text-fc-muted">
          {reveal.deductionType === "OWN_LAST_BID" ? "Your last bid" : "Passive passer rate"}
        </p>
      </motion.div>
      <button className="fc-btn-primary" onClick={() => router.push(`/room/${code}/draft`)}>
        Continue draft
      </button>
    </div>
  );
}
