"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

interface RoomNavProps {
  code: string;
  phase: string;
  isAdmin?: boolean;
}

const NAV_ITEMS = [
  { href: "lobby", label: "Lobby", phases: ["lobby", "bidding", "league", "season_end"] },
  { href: "market", label: "Market", phases: ["bidding"] },
  { href: "squad", label: "Squad", phases: ["bidding", "league", "season_end"] },
  { href: "trades", label: "Trades", phases: ["bidding", "league"] },
  { href: "icon-boxes", label: "Icons", phases: ["bidding", "league"] },
  { href: "hero-boxes", label: "Heroes", phases: ["bidding", "league"] },
  { href: "league", label: "League", phases: ["bidding", "league", "season_end"] },
  { href: "cards", label: "Cards", phases: ["bidding", "league"] },
  { href: "awards", label: "Awards", phases: ["league", "season_end"] },
  { href: "admin", label: "Admin", phases: ["lobby", "bidding", "league", "season_end"], adminOnly: true },
];

export function RoomNav({ code, phase, isAdmin }: RoomNavProps) {
  const pathname = usePathname();
  const visible = NAV_ITEMS.filter(
    (item) => item.phases.includes(phase) && (!item.adminOnly || isAdmin)
  );

  return (
    <nav className="border-b border-white/10 bg-fc-charcoal/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 overflow-x-auto scrollbar-none">
        {visible.map((item) => {
          const href = `/room/${code}/${item.href}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={item.href}
              href={href}
              className={`relative rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "text-fc-gold"
                  : "text-fc-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="room-nav-active"
                  className="absolute inset-0 rounded-lg border border-fc-gold/30 bg-fc-gold/10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
