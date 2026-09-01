import { getGoldPlayerPool } from "@/lib/players/seed";

let cachedMenFilters: { leagues: string[]; teams: string[] } | null = null;

/** Full league + team lists from the FC26 gold catalog (not just currently available cards) */
export function getCatalogFilterOptions(menOnly = true): {
  leagues: string[];
  teams: string[];
} {
  if (menOnly && cachedMenFilters) return cachedMenFilters;

  const pool = getGoldPlayerPool({ menOnly });
  const leagues = [
    ...new Set(pool.map((p) => p.league).filter((l): l is string => Boolean(l))),
  ].sort((a, b) => a.localeCompare(b));
  const teams = [
    ...new Set(pool.map((p) => p.realTeam).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const result = { leagues, teams };
  if (menOnly) cachedMenFilters = result;
  return result;
}
