import { toDayNumber } from "@/lib/day";
import { ALL_DAYS } from "./schedule";

function sortedUniqueDayNumbers(datesPlayed: string[]): number[] {
  return [...new Set(datesPlayed.map(toDayNumber))].sort((a, b) => a - b);
}

// 0 = Sunday … 6 = Saturday. Epoch day 0 (1970-01-01) is a Thursday (=4).
// Puzzle day numbers are always >= 0, so the modulo stays non-negative.
export function weekdayOf(dayNum: number): number {
  return ((dayNum % 7) + 4) % 7;
}

function isPublishDay(dayNum: number, days: readonly number[]): boolean {
  return days.includes(weekdayOf(dayNum));
}

// Smallest day number strictly greater than `dayNum` that publishes.
// Bounded: any run of 7 consecutive days contains every weekday, and
// `days` is non-empty (guaranteed by publishDaysFor), so this terminates.
function nextPublishDay(dayNum: number, days: readonly number[]): number {
  let d = dayNum + 1;
  while (!isPublishDay(d, days)) d++;
  return d;
}

// Largest day number <= `dayNum` that publishes.
function prevPublishDay(dayNum: number, days: readonly number[]): number {
  let d = dayNum;
  while (!isPublishDay(d, days)) d--;
  return d;
}

export function currentStreak(
  datesPlayed: string[],
  today: string,
  publishDays: readonly number[] = ALL_DAYS,
): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  const recent = prevPublishDay(toDayNumber(today), publishDays);
  const latest = days[days.length - 1];
  // Current only if the latest play is the most recent published puzzle, or
  // the one before it (a one-puzzle grace, mirroring today-or-yesterday).
  if (latest !== recent && latest !== prevPublishDay(recent - 1, publishDays)) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (nextPublishDay(days[i - 1], publishDays) === days[i]) streak++;
    else break;
  }
  return streak;
}

export function longestStreak(
  datesPlayed: string[],
  publishDays: readonly number[] = ALL_DAYS,
): number {
  const days = sortedUniqueDayNumbers(datesPlayed);
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (nextPublishDay(days[i - 1], publishDays) === days[i]) run++;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}
