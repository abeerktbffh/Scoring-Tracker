import { formatResult } from "@/lib/formatResult";
import { isBetter } from "@/scoring/wins";
import { compareVariant } from "@/scoring/medals";
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
  variant: string | null;
  played: boolean;
  valueFormatted: string | null;
  solved: boolean;
  rank: number | null;
  playerCount: number;
}

function scopeRow(
  game: { id: string; name: string },
  scope: TodayEntry[],
  variant: string | null,
  viewerId: string,
): TodayGameDetail {
  const playerCount = new Set(scope.map((e) => e.playerId)).size;
  const mine = scope.find((e) => e.playerId === viewerId) ?? null;
  if (!mine) {
    return { gameId: game.id, name: game.name, variant, played: false, valueFormatted: null, solved: false, rank: null, playerCount };
  }
  let rank: number | null = null;
  if (mine.solved) {
    const better = new Set(
      scope.filter((e) => e.solved && isBetter(e.value, mine.value, mine.direction)).map((e) => e.value),
    );
    rank = better.size + 1;
  }
  return {
    gameId: game.id,
    name: game.name,
    variant,
    played: true,
    valueFormatted: formatResult(game.id, mine.value, mine.solved, mine.detail ?? null),
    solved: mine.solved,
    rank,
    playerCount,
  };
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

  return input.games.flatMap((game) => {
    const all = byGame.get(game.id) ?? [];
    const variants = [...new Set(all.map((e) => e.variant ?? null))];
    if (variants.length <= 1) {
      const v = variants.length === 1 ? variants[0] : null;
      return [scopeRow(game, all, v, input.viewerId)];
    }
    return variants
      .sort(compareVariant)
      .map((v) => scopeRow(game, all.filter((e) => (e.variant ?? null) === v), v, input.viewerId));
  });
}
