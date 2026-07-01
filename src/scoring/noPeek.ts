export function isDailyBoardLocked(window: string, hasPlayedGameToday: boolean): boolean {
  return window === "daily" && !hasPlayedGameToday;
}

export function visibleTodayEntries<T extends { gameId: string }>(
  entries: T[],
  playedGameIds: Set<string>,
): T[] {
  return entries.filter((e) => playedGameIds.has(e.gameId));
}
