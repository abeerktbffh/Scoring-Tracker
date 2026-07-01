export function localDateInTz(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; timeZone shifts the instant to the group's local day.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

export function toDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}
