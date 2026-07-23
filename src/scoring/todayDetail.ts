import { formatResult } from "@/lib/formatResult";
import { isBetter } from "@/scoring/wins";
import type { ResultDetail } from "@/parsers/types";

export interface TodayEntry {
  playerId: string;
  gameId: string;
  variant: string | null;
  value: number;
  solved: boolean;
  direction: "lower_better" | "higher_better";
  detail?: ResultDetail | null;
}

export interface TodayGameDetail {
  gameId: string;
  name: string;
  played: boolean;
  valueFormatted: string | null;
  solved: boolean;
  rank: number | null;
  playerCount: number;
}

export function computeTodayDetail(input: {
  games: { id: string; name: string }[];
  entries: TodayEntry[];
  viewerId: string;
}): TodayGameDetail[] {
  const byGame = new Map<string, TodayEntry[]>();
  for (const e of input.entries) {
    const g = byGame.get(e.gameId) ?? [];
    g.push(e);
    byGame.set(e.gameId, g);
  }

  return input.games.map((game) => {
    const all = byGame.get(game.id) ?? [];
    const mine = all.find((e) => e.playerId === input.viewerId) ?? null;
    // Rank/count are scoped to the viewer's variant when they played; else all.
    const scope = mine ? all.filter((e) => (e.variant ?? null) === (mine.variant ?? null)) : all;
    const playerCount = new Set(scope.map((e) => e.playerId)).size;

    if (!mine) {
      return { gameId: game.id, name: game.name, played: false, valueFormatted: null, solved: false, rank: null, playerCount };
    }

    let rank: number | null = null;
    if (mine.solved) {
      const dir = mine.direction;
      const betterDistinct = new Set(
        scope.filter((e) => e.solved && isBetter(e.value, mine.value, dir)).map((e) => e.value),
      );
      rank = betterDistinct.size + 1;
    }
    return {
      gameId: game.id,
      name: game.name,
      played: true,
      valueFormatted: formatResult(game.id, mine.value, mine.solved, mine.detail ?? null),
      solved: mine.solved,
      rank,
      playerCount,
    };
  });
}
