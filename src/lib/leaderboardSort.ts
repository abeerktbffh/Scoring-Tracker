import type { OverallRow } from "./api";

/**
 * Overall medal-tally order: gold, then silver, then bronze, then name.
 * Pure: does not mutate the input.
 */
export function sortByMedals(rows: OverallRow[]): OverallRow[] {
  return [...rows].sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.displayName.localeCompare(b.displayName),
  );
}
