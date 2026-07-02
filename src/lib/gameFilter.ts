export interface GameOption {
  id: string;
  name: string;
}

export interface FilteredGames {
  due: GameOption[];
  rest: GameOption[];
}

/**
 * Splits and orders games for the searchable game picker.
 *
 * `due` = games whose id is in `dueTodayIds` AND whose name matches `query`
 * (case-insensitive substring), ordered by name.
 * `rest` = games NOT in `dueTodayIds` whose name matches `query`, ordered by name.
 *
 * Pure: does not mutate `games` or `dueTodayIds`. An empty query matches everything.
 */
export function filterAndOrderGames(
  games: GameOption[],
  query: string,
  dueTodayIds: string[]
): FilteredGames {
  const normalizedQuery = query.trim().toLowerCase();
  const dueIds = new Set(dueTodayIds);

  const matches = (game: GameOption): boolean =>
    normalizedQuery === "" || game.name.toLowerCase().includes(normalizedQuery);

  const byName = (a: GameOption, b: GameOption): number => a.name.localeCompare(b.name);

  const due = games.filter((g) => dueIds.has(g.id) && matches(g)).sort(byName);
  const rest = games.filter((g) => !dueIds.has(g.id) && matches(g)).sort(byName);

  return { due, rest };
}
