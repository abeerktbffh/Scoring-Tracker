import { tallyWins, type GameEntry } from "./wins";

export interface OverallStat {
  playerId: string;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

export function computeOverall(entries: GameEntry[]): OverallStat[] {
  const played = new Map<string, number>();
  for (const e of entries) played.set(e.playerId, (played.get(e.playerId) ?? 0) + 1);

  const winsById = new Map(tallyWins(entries).map((w) => [w.playerId, w.wins]));

  const stats: OverallStat[] = [...played.entries()].map(([playerId, gamesPlayed]) => {
    const wins = winsById.get(playerId) ?? 0;
    const winRate = gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100) / 100;
    return { playerId, wins, gamesPlayed, winRate };
  });

  return stats.sort(
    (a, b) => b.wins - a.wins || b.winRate - a.winRate || a.playerId.localeCompare(b.playerId),
  );
}
