import { computeGameBoard, type DatedGameEntry } from "@/scoring/gameBoard";
import type { ResultDetail } from "@/parsers/types";

export interface MeEntry {
  gameId: string;
  variant: string | null;
  puzzleDate: string;
  value: number;
  solved: boolean;
  direction: "lower_better" | "higher_better";
  detail?: ResultDetail | null;
  /** When the entry was logged (ISO). Drives "recent" order — newest logged first. */
  createdAt?: string;
}

export interface MeGame {
  id: string;
  name: string;
}

export interface MeInput {
  today: string;
  games: MeGame[];
  entries: MeEntry[];
}

export interface MeResult {
  today: {
    date: string;
    loggedCount: number;
    totalCount: number;
    games: { gameId: string; name: string; logged: boolean }[];
  };
  streaks: {
    gameId: string;
    name: string;
    currentStreak: number;
    longestStreak: number;
  }[];
  recent: {
    gameId: string;
    name: string;
    variant: string | null;
    value: number;
    solved: boolean;
    puzzleDate: string;
    detail: ResultDetail | null;
  }[];
}

export function computeMe(input: MeInput): MeResult {
  const { today, games, entries } = input;

  const todayGames = games.map((g) => ({
    gameId: g.id,
    name: g.name,
    logged: entries.some((e) => e.gameId === g.id && e.puzzleDate === today),
  }));
  const loggedCount = todayGames.filter((g) => g.logged).length;

  const entriesByGame = new Map<string, MeEntry[]>();
  for (const e of entries) {
    let g = entriesByGame.get(e.gameId);
    if (!g) {
      g = [];
      entriesByGame.set(e.gameId, g);
    }
    g.push(e);
  }

  const streaks = games.map((g) => {
    const gameEntries = entriesByGame.get(g.id) ?? [];
    const datedEntries: DatedGameEntry[] = gameEntries.map((e) => ({
      playerId: "me",
      gameId: e.gameId,
      variant: e.variant,
      puzzleKey: `${e.gameId}|${e.puzzleDate}`,
      value: e.value,
      solved: e.solved,
      direction: e.direction,
      puzzleDate: e.puzzleDate,
    }));
    const board = computeGameBoard(datedEntries, today, null);
    const stat = board.find((s) => s.playerId === "me");
    return {
      gameId: g.id,
      name: g.name,
      currentStreak: stat?.currentStreak ?? 0,
      longestStreak: stat?.longestStreak ?? 0,
    };
  });

  const nameById = new Map(games.map((g) => [g.id, g.name]));
  // "Recent" = most recently LOGGED first (by created_at); fall back to
  // puzzle_date when created_at is absent. Sorting by puzzle_date alone left
  // same-day entries in an arbitrary order, so "your latest" was unreliable.
  const recent = [...entries]
    .sort((a, b) => {
      const ax = a.createdAt ?? "";
      const bx = b.createdAt ?? "";
      if (ax !== bx) return ax < bx ? 1 : -1;
      return a.puzzleDate < b.puzzleDate ? 1 : a.puzzleDate > b.puzzleDate ? -1 : 0;
    })
    .slice(0, 10)
    .map((e) => ({
      gameId: e.gameId,
      name: nameById.get(e.gameId) ?? e.gameId,
      variant: e.variant,
      value: e.value,
      solved: e.solved,
      puzzleDate: e.puzzleDate,
      detail: e.detail ?? null,
    }));

  return {
    today: { date: today, loggedCount, totalCount: games.length, games: todayGames },
    streaks,
    recent,
  };
}
