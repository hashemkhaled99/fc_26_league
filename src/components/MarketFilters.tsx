"use client";

import { POSITIONS } from "@/lib/auction/constants";

export const RATING_MIN = 75;
export const RATING_MAX = 99;

export interface MarketFiltersState {
  search: string;
  position: string;
  team: string;
  league: string;
  minRating: number;
  maxRating: number;
}

interface MarketFiltersProps {
  filters: MarketFiltersState;
  onChange: (next: MarketFiltersState) => void;
  teams: string[];
  leagues: string[];
  resultCount: number;
}

export function MarketFilters({
  filters,
  onChange,
  teams,
  leagues,
  resultCount,
}: MarketFiltersProps) {
  function set<K extends keyof MarketFiltersState>(key: K, value: MarketFiltersState[K]) {
    onChange({ ...filters, [key]: value });
  }

  function onMinChange(value: number) {
    const minRating = Math.min(value, filters.maxRating);
    onChange({ ...filters, minRating });
  }

  function onMaxChange(value: number) {
    const maxRating = Math.max(value, filters.minRating);
    onChange({ ...filters, maxRating });
  }

  const hasActive =
    filters.search ||
    filters.position !== "ALL" ||
    filters.team ||
    filters.league ||
    filters.minRating > RATING_MIN ||
    filters.maxRating < RATING_MAX;

  const rangePercentLeft =
    ((filters.minRating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;
  const rangePercentRight =
    ((filters.maxRating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;

  return (
    <div className="fc-card space-y-4 p-4">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fc-muted">
          Search player
        </label>
        <input
          className="fc-input"
          placeholder="Type a name… e.g. Mbappé, Salah"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fc-muted">
            Team
          </label>
          <select
            className="fc-input"
            value={filters.team}
            onChange={(e) => set("team", e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fc-muted">
            League ({leagues.length})
          </label>
          <select
            className="fc-input"
            value={filters.league}
            onChange={(e) => set("league", e.target.value)}
          >
            <option value="">All leagues</option>
            {leagues.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dual OVR range slider */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-fc-muted">
            Rating range
          </label>
          <span className="font-mono text-sm font-bold text-fc-gold">
            {filters.minRating} – {filters.maxRating} OVR
          </span>
        </div>

        <div className="relative h-8 flex items-center">
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-fc-charcoal" />
          <div
            className="absolute h-1.5 rounded-full bg-fc-gold"
            style={{
              left: `${rangePercentLeft}%`,
              right: `${100 - rangePercentRight}%`,
            }}
          />
          <input
            type="range"
            min={RATING_MIN}
            max={RATING_MAX}
            value={filters.minRating}
            onChange={(e) => onMinChange(Number(e.target.value))}
            className="fc-range absolute inset-x-0 w-full"
            aria-label="Minimum overall rating"
          />
          <input
            type="range"
            min={RATING_MIN}
            max={RATING_MAX}
            value={filters.maxRating}
            onChange={(e) => onMaxChange(Number(e.target.value))}
            className="fc-range absolute inset-x-0 w-full"
            aria-label="Maximum overall rating"
          />
        </div>

        <div className="mt-1 flex justify-between text-xs text-fc-muted font-mono">
          <span>{RATING_MIN}</span>
          <span>{RATING_MAX}</span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fc-muted">
          Position
        </label>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => set("position", "ALL")}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
              filters.position === "ALL"
                ? "bg-fc-gold text-fc-navy"
                : "bg-fc-charcoal text-fc-muted hover:text-white"
            }`}
          >
            ALL
          </button>
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => set("position", pos)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                filters.position === pos
                  ? "bg-fc-gold text-fc-navy"
                  : "bg-fc-charcoal text-fc-muted hover:text-white"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <p className="text-sm text-fc-muted">
          Showing <span className="font-semibold text-fc-gold">{resultCount}</span> players
        </p>
        {hasActive && (
          <button
            type="button"
            onClick={() =>
              onChange({
                search: "",
                position: "ALL",
                team: "",
                league: "",
                minRating: RATING_MIN,
                maxRating: RATING_MAX,
              })
            }
            className="text-xs font-semibold text-fc-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

export function applyMarketFilters<
  T extends {
    name: string;
    realTeam: string;
    league?: string | null;
    position: string;
    baseRating: number;
  },
>(players: T[], filters: MarketFiltersState): T[] {
  const q = filters.search.trim().toLowerCase();

  return players.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.realTeam.toLowerCase().includes(q)) {
      return false;
    }
    if (filters.position !== "ALL" && p.position !== filters.position) return false;
    if (filters.team && p.realTeam !== filters.team) return false;
    if (filters.league && (p.league ?? "") !== filters.league) return false;
    if (p.baseRating < filters.minRating || p.baseRating > filters.maxRating) return false;
    return true;
  });
}
