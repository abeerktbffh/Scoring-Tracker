import { toDayNumber } from "@/lib/day";

function sortedUniqueDayNumbers(datesPlayed: string[]): number[] {
  return [...new Set(datesPlayed.map(toDayNumber))].sort((a, b) => a - b);
}

export function currentStreak(datesPlayed: string[], today: string): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  const t = toDayNumber(today);
  const latest = days[days.length - 1];
  // Streak is only "current" if the most recent play was today or yesterday.
  if (latest !== t && latest !== t - 1) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (days[i] - days[i - 1] === 1) streak++;
    else break;
  }
  return streak;
}

export function longestStreak(datesPlayed: string[]): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] === 1) run++;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}
