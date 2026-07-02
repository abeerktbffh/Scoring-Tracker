import type { OverallRow } from "./api";

export type LeaderboardSortKey = "wins" | "gamesPlayed" | "winRate";

/**
 * Returns a new array of rows sorted descending by the given key.
 * Pure: does not mutate the input. Stable: rows with equal key values
 * keep their relative input order.
 */
export function sortPlayers(rows: OverallRow[], key: LeaderboardSortKey): OverallRow[] {
  return [...rows].sort((a, b) => b[key] - a[key]);
}
