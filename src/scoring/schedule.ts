// Which weekdays each game publishes a puzzle. 0 = Sunday … 6 = Saturday.
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

// gameId -> the weekdays that game publishes. Unlisted games publish daily.
const SCHEDULE: Record<string, number[]> = {
  "easy-down": WEEKDAYS,
};

export function publishDaysFor(gameId: string): number[] {
  return SCHEDULE[gameId] ?? [...ALL_DAYS];
}
