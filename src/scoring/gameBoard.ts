import { tallyWins, type GameEntry } from "./wins";
import { currentStreak, longestStreak } from "./streaks";

export type DatedGameEntry = GameEntry & { puzzleDate: string };

export interface GameBoardStat {
  playerId: string;
  wins: number;
  gamesPlayed: number;
  bestValue: number | null;
  currentStreak: number;
  longestStreak: number;
}

function isBetter(a: number, b: number, dir: GameEntry["direction"]): boolean {
  return dir === "lower_better" ? a < b : a > b;
}

export function computeGameBoard(
  entries: DatedGameEntry[],
  today: string,
  start: string | null,
): GameBoardStat[] {
  const inWindow = (d: string) => start === null || d >= start;
  const windowed = entries.filter((e) => inWindow(e.puzzleDate));

  const winsById = new Map(tallyWins(windowed).map((w) => [w.playerId, w.wins]));

  // Per-player aggregates.
  const byPlayer = new Map<string, DatedGameEntry[]>();
  for (const e of entries) {
    let g = byPlayer.get(e.playerId);
    if (!g) { g = []; byPlayer.set(e.playerId, g); }
    g.push(e);
  }

  const stats: GameBoardStat[] = [...byPlayer.entries()].map(([playerId, all]) => {
    const win = all.filter((e) => inWindow(e.puzzleDate));
    const solvedWin = win.filter((e) => e.solved);
    let bestValue: number | null = null;
    for (const e of solvedWin) if (bestValue === null || isBetter(e.value, bestValue, e.direction)) bestValue = e.value;
    const allDates = all.map((e) => e.puzzleDate);
    return {
      playerId,
      wins: winsById.get(playerId) ?? 0,
      gamesPlayed: win.length,
      bestValue,
      currentStreak: currentStreak(allDates, today),
      longestStreak: longestStreak(allDates),
    };
  });

  // Only include players with at least one in-window entry.
  const direction = entries[0]?.direction ?? "lower_better";
  return stats
    .filter((s) => s.gamesPlayed > 0)
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        bestCompare(a.bestValue, b.bestValue, direction) ||
        a.playerId.localeCompare(b.playerId),
    );
}

function bestCompare(a: number | null, b: number | null, dir: GameEntry["direction"]): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls last
  if (b === null) return -1;
  return dir === "lower_better" ? a - b : b - a;
}
