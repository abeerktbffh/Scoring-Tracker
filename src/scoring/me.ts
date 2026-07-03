import { computeGameBoard, type DatedGameEntry } from "@/scoring/gameBoard";

export interface MeEntry {
  gameId: string;
  variant: string | null;
  puzzleDate: string;
  value: number;
  solved: boolean;
  direction: "lower_better" | "higher_better";
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
  const recent = [...entries]
    .sort((a, b) => (a.puzzleDate < b.puzzleDate ? 1 : a.puzzleDate > b.puzzleDate ? -1 : 0))
    .slice(0, 10)
    .map((e) => ({
      gameId: e.gameId,
      name: nameById.get(e.gameId) ?? e.gameId,
      variant: e.variant,
      value: e.value,
      solved: e.solved,
      puzzleDate: e.puzzleDate,
    }));

  return {
    today: { date: today, loggedCount, totalCount: games.length, games: todayGames },
    streaks,
    recent,
  };
}
