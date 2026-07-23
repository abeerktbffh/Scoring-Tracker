/**
 * Formats which of today's games are still to be played, so the viewer can
 * see what's pending rather than an anonymous "not done yet" tile.
 * Pure: does not mutate the input.
 */
export function formatPendingGames(games: { name: string; logged: boolean }[]): string {
  const pending = games.filter((g) => !g.logged).map((g) => g.name);
  if (pending.length === 0) return "All done today 🎉";
  return `Still to play: ${pending.join(" · ")}`;
}
