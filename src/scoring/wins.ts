export interface GameEntry {
  playerId: string;
  gameId: string;
  variant: string | null;
  puzzleKey: string;
  value: number;
  solved: boolean;
  direction: "lower_better" | "higher_better";
}

function isBetter(a: number, b: number, dir: GameEntry["direction"]): boolean {
  return dir === "lower_better" ? a < b : a > b;
}

export function tallyWins(entries: GameEntry[]): { playerId: string; wins: number }[] {
  const wins = new Map<string, number>();
  for (const e of entries) wins.set(e.playerId, wins.get(e.playerId) ?? 0);

  // Group by game + variant + puzzle.
  const groups = new Map<string, GameEntry[]>();
  for (const e of entries) {
    const key = `${e.gameId}|${e.variant ?? ""}|${e.puzzleKey}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(e);
  }

  for (const group of groups.values()) {
    const solved = group.filter((e) => e.solved);
    if (solved.length === 0) continue;
    let best = solved[0].value;
    for (const e of solved) if (isBetter(e.value, best, e.direction)) best = e.value;
    for (const e of solved) if (e.value === best) wins.set(e.playerId, wins.get(e.playerId)! + 1);
  }

  return [...wins.entries()]
    .map(([playerId, w]) => ({ playerId, wins: w }))
    .sort((a, b) => b.wins - a.wins || a.playerId.localeCompare(b.playerId));
}
