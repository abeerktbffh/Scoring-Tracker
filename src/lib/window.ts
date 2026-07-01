import { toDayNumber, fromDayNumber } from "./day";

export type Window = "daily" | "weekly" | "monthly" | "all";

const SPAN: Record<Exclude<Window, "all">, number> = {
  daily: 0,
  weekly: 6,
  monthly: 29,
};

// Earliest puzzle_date to include for a window, or null for all-time.
export function windowStart(window: Window, today: string): string | null {
  if (window === "all") return null;
  return fromDayNumber(toDayNumber(today) - SPAN[window]);
}
